#!/usr/bin/env python3
"""
drawdown_alert.py — Controllo giornaliero drawdown VWCE + CSNDX.

Eseguito da GitHub Actions ogni mattina:
  1. Scarica history CSV dal Google Sheet (URL da env var)
  2. Calcola DD12M, DD-ATH, MA200 di VWCE e CSNDX
  3. Se VWCE o CSNDX hanno DD12M < soglia → invia email di alert via Gmail SMTP
  4. Altrimenti termina silenziosamente

Configurazione tramite environment variables (GitHub Secrets):
  SHEET_HISTORY_URL    — URL CSV pubblico del foglio history
  GMAIL_USER           — Gmail address (es. nome@gmail.com)
  GMAIL_APP_PASSWORD   — App Password 16 caratteri da Google
  ALERT_EMAIL_TO       — destinatario alert
  ALERT_THRESHOLD      — soglia DD12M (default -0.05)
"""

import os
import sys
import csv
import io
import smtplib
import urllib.request
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# -------------------------------------------------------------------------
# CONFIG (da env)
# -------------------------------------------------------------------------
HISTORY_CSV_URL = os.environ.get('SHEET_HISTORY_URL', '').strip()
GMAIL_USER = os.environ.get('GMAIL_USER', '').strip()
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '').strip()
ALERT_EMAIL_TO = os.environ.get('ALERT_EMAIL_TO', GMAIL_USER).strip()
ALERT_THRESHOLD = float(os.environ.get('ALERT_THRESHOLD', '-0.05'))

# Tier definitions: (soglia_max_dd12m, num_tier, label, action_text)
TIERS = [
    (-0.05, 1, '🟡 Tier 1 — Drawdown lieve', 'Multiplier 1.2x suggerito (PAC €600)'),
    (-0.10, 2, '🟠 Tier 2 — Drawdown moderato', 'Multiplier 1.5x suggerito (PAC €750)'),
    (-0.15, 3, '🔴 Tier 3 — Drawdown severo', 'Multiplier 2.0x suggerito (PAC €1000)'),
    (-0.25, 4, '🚨 Tier 4 — Drawdown estremo', 'Multiplier 2.5x suggerito (PAC €1250). Opportunità storica.'),
]

# -------------------------------------------------------------------------
# CSV PARSER (formato italiano)
# -------------------------------------------------------------------------
def parse_italian_number(s):
    if not s or not s.strip():
        return None
    cleaned = s.strip().replace('€', '').replace('\u00A0', '').replace(' ', '')
    if ',' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    try:
        return float(cleaned)
    except ValueError:
        return None

def parse_italian_date(s):
    if not s:
        return None
    parts = s.strip().split(' ')[0].split('/')
    if len(parts) != 3:
        return None
    try:
        dd, mm, yyyy = parts
        return f"{yyyy}-{int(mm):02d}-{int(dd):02d}"
    except ValueError:
        return None

# -------------------------------------------------------------------------
# FETCH & PARSE HISTORY
# -------------------------------------------------------------------------
def fetch_history():
    """Scarica history CSV. Ritorna dict {ticker: [{date, close}, ...]}."""
    if not HISTORY_CSV_URL:
        raise ValueError("SHEET_HISTORY_URL non configurato (manca GitHub Secret)")

    req = urllib.request.Request(
        HISTORY_CSV_URL,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; PAC-Terminal-Alert/1.0)'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        text = resp.read().decode('utf-8')

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if len(rows) < 50:
        raise ValueError(f"History troppo corta: {len(rows)} righe")

    # Struttura attesa del foglio history:
    # col 0: Date VWCE        col 1: Close VWCE (EUR)
    # col 2: vuota
    # col 3: Date CNDX        col 4: Close CNDX (USD raw)
    # col 5: Currency         col 6: Close CNDX in EUR (convertito tasso fisso)
    vwce, cndx = [], []
    for r in rows[1:]:  # skip header
        if not r:
            continue
        # VWCE
        if len(r) >= 2:
            d = parse_italian_date(r[0])
            c = parse_italian_number(r[1])
            if d and c and c > 0:
                vwce.append({'date': d, 'close': c})
        # CNDX (col 6 = EUR convertito; fallback col 4 = USD raw)
        if len(r) >= 7:
            d = parse_italian_date(r[3])
            c = parse_italian_number(r[6])
            if d and c and c > 0:
                cndx.append({'date': d, 'close': c})
        elif len(r) >= 5:
            d = parse_italian_date(r[3])
            c = parse_italian_number(r[4])
            if d and c and c > 0:
                cndx.append({'date': d, 'close': c})

    return {'VWCE': vwce, 'CSNDX': cndx}

# -------------------------------------------------------------------------
# METRICHE
# -------------------------------------------------------------------------
def compute_metrics(history):
    if len(history) < 50:
        return None
    closes = [d['close'] for d in history]
    current = closes[-1]
    current_date = history[-1]['date']

    ath = max(closes)
    dd_ath = (current / ath) - 1

    last252 = closes[-252:] if len(closes) >= 252 else closes
    high_12m = max(last252)
    dd_12m = (current / high_12m) - 1

    last200 = closes[-200:] if len(closes) >= 200 else closes
    ma200 = sum(last200) / len(last200) if last200 else None
    dev_ma200 = (current / ma200) - 1 if ma200 else None

    return {
        'current': current, 'current_date': current_date,
        'ath': ath, 'dd_ath': dd_ath,
        'high_12m': high_12m, 'dd_12m': dd_12m,
        'ma200': ma200, 'dev_ma200': dev_ma200,
    }

def determine_tier(dd_12m):
    matched = (0, '🟢 Tier 0 — Normale', 'Mantieni PAC base €500')
    for threshold, tier_num, label, action in TIERS:
        if dd_12m <= threshold:
            matched = (tier_num, label, action)
    return matched

# -------------------------------------------------------------------------
# EMAIL
# -------------------------------------------------------------------------
def build_email_body(metrics_by_etf, alerts):
    lines = []
    lines.append("PAC Terminal — Alert Drawdown")
    lines.append("=" * 45)
    lines.append("")
    lines.append(f"Data check: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("📉 ETF MONITORATI")
    lines.append("-" * 45)

    for etf, m in metrics_by_etf.items():
        if not m:
            continue
        tier_num, tier_label, tier_action = determine_tier(m['dd_12m'])
        in_alert = etf in alerts
        marker = "🚨 ALERT" if in_alert else "✅ OK"

        lines.append("")
        lines.append(f"  {etf}  [{marker}]")
        lines.append(f"    Prezzo:        € {m['current']:.2f}  (al {m['current_date']})")
        lines.append(f"    DD 12M:        {m['dd_12m']*100:+.2f}%")
        lines.append(f"    DD ATH:        {m['dd_ath']*100:+.2f}%")
        lines.append(f"    MA200 dev:     {m['dev_ma200']*100:+.2f}%")
        lines.append(f"    Tier:          {tier_label}")
        if in_alert:
            lines.append(f"    Azione:        {tier_action}")

    lines.append("")
    lines.append("=" * 45)
    lines.append("")

    # Note specifiche per casi misti
    has_vwce_alert = 'VWCE' in alerts
    has_cndx_alert = 'CSNDX' in alerts

    if has_vwce_alert and has_cndx_alert:
        lines.append("📌 Entrambi gli ETF in drawdown: opportunità di boost generalizzato.")
        lines.append("   Considera di destinare l'extra al 90/10 standard.")
    elif has_vwce_alert and not has_cndx_alert:
        lines.append("📌 Solo VWCE in drawdown: boost sul global ETF (90% allocation).")
    elif not has_vwce_alert and has_cndx_alert:
        lines.append("📌 Solo CSNDX in drawdown: il satellite tech è giù mentre il global no.")
        lines.append("   NON è un trigger ufficiale del PAC strategy engine (basato su VWCE),")
        lines.append("   ma puoi valutare un acquisto extra sul satellite (decisione discrezionale).")

    lines.append("")
    lines.append(f"🔗 Dashboard: https://vincenzopaciullo89-lab.github.io/pac-terminal/")
    lines.append("")
    lines.append("---")
    lines.append(f"Soglia alert: DD12M ≤ {ALERT_THRESHOLD*100:.1f}%")
    lines.append(f"Generato automaticamente da GitHub Actions.")

    return "\n".join(lines)

def send_email(subject, body):
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        print("⚠️  GMAIL_USER o GMAIL_APP_PASSWORD non configurati. Skip invio.")
        return False

    msg = MIMEMultipart()
    msg['From'] = GMAIL_USER
    msg['To'] = ALERT_EMAIL_TO
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain', 'utf-8'))

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=20) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.send_message(msg)
        print(f"✅ Email inviata a {ALERT_EMAIL_TO}")
        return True
    except Exception as e:
        print(f"❌ Errore invio email: {e}", file=sys.stderr)
        return False

# -------------------------------------------------------------------------
# MAIN
# -------------------------------------------------------------------------
def main():
    print("=== PAC Terminal Drawdown Alert ===")
    print(f"Soglia: DD12M ≤ {ALERT_THRESHOLD*100:.1f}%")

    if not HISTORY_CSV_URL:
        print("❌ SHEET_HISTORY_URL non configurato. Configura il GitHub Secret.", file=sys.stderr)
        sys.exit(1)

    try:
        history_by_etf = fetch_history()
        for etf, hist in history_by_etf.items():
            print(f"✅ {etf}: {len(hist)} punti")
    except Exception as e:
        print(f"❌ Fetch history fallito: {e}", file=sys.stderr)
        sys.exit(1)

    # Calcola metriche per ogni ETF
    metrics_by_etf = {}
    for etf, hist in history_by_etf.items():
        m = compute_metrics(hist)
        if m:
            metrics_by_etf[etf] = m
            print(f"\n📊 {etf}: prezzo=€{m['current']:.2f}, DD12M={m['dd_12m']*100:+.2f}%, MA200dev={m['dev_ma200']*100:+.2f}%")

    # Determina quali ETF sono in alert
    alerts = []
    for etf, m in metrics_by_etf.items():
        if m['dd_12m'] <= ALERT_THRESHOLD:
            alerts.append(etf)

    if not alerts:
        print(f"\n✅ Nessun ETF sotto soglia. Silenzio.")
        return

    print(f"\n🚨 ETF in alert: {', '.join(alerts)}")
    body = build_email_body(metrics_by_etf, alerts)

    # Subject costruito in base agli ETF in alert
    if len(alerts) == 1:
        etf = alerts[0]
        subject = f"[PAC Alert] {etf} drawdown {metrics_by_etf[etf]['dd_12m']*100:+.1f}%"
    else:
        subject = f"[PAC Alert] Multipli ETF in drawdown ({', '.join(alerts)})"

    send_email(subject, body)

if __name__ == '__main__':
    main()
