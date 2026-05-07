#!/usr/bin/env python3
"""
drawdown_alert.py — Controllo giornaliero del drawdown VWCE.

Eseguito da GitHub Actions ogni mattina:
  1. Scarica il foglio history dal Google Sheet pubblicato
  2. Calcola DD12M, DD-ATH e deviazione MA200 di VWCE
  3. Se DD12M < soglia → invia email di alert via Gmail SMTP
  4. Altrimenti stampa solo log e termina silenziosamente

Configurazione tramite environment variables (GitHub Secrets):
  GMAIL_USER          — il tuo indirizzo Gmail (es. nome@gmail.com)
  GMAIL_APP_PASSWORD  — App Password di 16 caratteri generata da Google
  ALERT_EMAIL_TO      — destinatario degli alert (può essere il tuo Gmail stesso)
  ALERT_THRESHOLD     — soglia DD12M (es. "-0.05" per -5%, default -0.05)
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
# CONFIGURAZIONE
# -------------------------------------------------------------------------
HISTORY_CSV_URL = (
    'https://docs.google.com/spreadsheets/d/e/'
    '2PACX-1vSAO78B6Q5XKyReR0tAjNT5hDEuE4RQSoAdEsa3t9KWSzjfYE2'
    'S4OtJ3wazmvU7gMnYveo2OlB0wAFs/pub'
    '?gid=1714634805&single=true&output=csv'
)

GMAIL_USER = os.environ.get('GMAIL_USER', '')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')
ALERT_EMAIL_TO = os.environ.get('ALERT_EMAIL_TO', GMAIL_USER)
ALERT_THRESHOLD = float(os.environ.get('ALERT_THRESHOLD', '-0.05'))

# Soglie tier per messaggio email
TIERS = [
    (-0.05, 1, '🟡 Tier 1 — Drawdown lieve', 'Multiplier 1.2x suggerito (PAC €600)'),
    (-0.10, 2, '🟠 Tier 2 — Drawdown moderato', 'Multiplier 1.5x suggerito (PAC €750)'),
    (-0.15, 3, '🔴 Tier 3 — Drawdown severo', 'Multiplier 2.0x suggerito (PAC €1000)'),
    (-0.25, 4, '🚨 Tier 4 — Drawdown estremo', 'Multiplier 2.5x suggerito (PAC €1250). Opportunità storica.'),
]

# -------------------------------------------------------------------------
# CSV PARSER (formato italiano, riusa la logica del sito)
# -------------------------------------------------------------------------
def parse_italian_number(s: str):
    if not s or not s.strip():
        return None
    cleaned = s.strip().replace('€', '').replace('\u00A0', '').replace(' ', '')
    if ',' in cleaned:
        cleaned = cleaned.replace('.', '').replace(',', '.')
    try:
        return float(cleaned)
    except ValueError:
        return None

def parse_italian_date(s: str):
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
# FETCH & PARSE
# -------------------------------------------------------------------------
def fetch_history():
    """Scarica il CSV history e ritorna lista di {date, close} per VWCE."""
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

    vwce = []
    for r in rows[1:]:  # skip header
        if len(r) < 2:
            continue
        d = parse_italian_date(r[0])
        c = parse_italian_number(r[1])
        if d and c and c > 0:
            vwce.append({'date': d, 'close': c})

    if len(vwce) < 50:
        raise ValueError(f"VWCE history troppo corta: {len(vwce)} punti")
    return vwce

# -------------------------------------------------------------------------
# METRICHE
# -------------------------------------------------------------------------
def compute_metrics(history):
    closes = [d['close'] for d in history]
    current = closes[-1]
    current_date = history[-1]['date']

    # ATH e DD da ATH
    ath = max(closes)
    dd_ath = (current / ath) - 1

    # DD 12M (252 giorni)
    last252 = closes[-252:] if len(closes) >= 252 else closes
    high_12m = max(last252)
    dd_12m = (current / high_12m) - 1

    # MA 200
    last200 = closes[-200:] if len(closes) >= 200 else closes
    ma200 = sum(last200) / len(last200) if last200 else None
    dev_ma200 = (current / ma200) - 1 if ma200 else None

    return {
        'current': current,
        'current_date': current_date,
        'ath': ath,
        'dd_ath': dd_ath,
        'high_12m': high_12m,
        'dd_12m': dd_12m,
        'ma200': ma200,
        'dev_ma200': dev_ma200,
    }

def determine_tier(dd_12m):
    """Ritorna (tier_num, label, action) per il DD dato."""
    matched = (0, '🟢 Tier 0 — Normale', 'Mantieni PAC base €500')
    for threshold, tier_num, label, action in TIERS:
        if dd_12m <= threshold:
            matched = (tier_num, label, action)
    return matched

# -------------------------------------------------------------------------
# EMAIL
# -------------------------------------------------------------------------
def build_email_body(m, tier_label, tier_action):
    return f"""
PAC Terminal — Alert Drawdown VWCE
=====================================

Data check: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}

📉 SITUAZIONE ATTUALE
-------------------------------------
Prezzo VWCE corrente: € {m['current']:.2f} (al {m['current_date']})
ATH:                  € {m['ath']:.2f}
Massimo 12M:          € {m['high_12m']:.2f}
MA 200 giorni:        € {m['ma200']:.2f}

📊 METRICHE DI RISCHIO
-------------------------------------
Drawdown 12M:    {m['dd_12m']*100:+.2f}%
Drawdown ATH:    {m['dd_ath']*100:+.2f}%
Dev. MA200:      {m['dev_ma200']*100:+.2f}%

🎯 RACCOMANDAZIONE
-------------------------------------
{tier_label}
Azione: {tier_action}

🔗 Apri il dashboard per dettagli:
https://vincenzopaciullo89-lab.github.io/pac-terminal/

---
Alert generato automaticamente da GitHub Actions.
Soglia configurata: DD12M ≤ {ALERT_THRESHOLD*100:.1f}%
"""

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
    print(f"=== PAC Terminal Drawdown Alert ===")
    print(f"Soglia attiva: DD12M ≤ {ALERT_THRESHOLD*100:.1f}%")

    try:
        history = fetch_history()
        print(f"✅ History caricata: {len(history)} punti")
    except Exception as e:
        print(f"❌ Fetch history fallito: {e}", file=sys.stderr)
        sys.exit(1)

    metrics = compute_metrics(history)
    tier_num, tier_label, tier_action = determine_tier(metrics['dd_12m'])

    print(f"\n📊 Metriche correnti:")
    print(f"  Prezzo:      € {metrics['current']:.2f}")
    print(f"  DD 12M:      {metrics['dd_12m']*100:+.2f}%")
    print(f"  DD ATH:      {metrics['dd_ath']*100:+.2f}%")
    print(f"  Dev MA200:   {metrics['dev_ma200']*100:+.2f}%")
    print(f"  Tier:        {tier_label}")

    if metrics['dd_12m'] <= ALERT_THRESHOLD:
        print(f"\n🚨 DD12M sotto soglia, invio alert...")
        subject = f"[PAC Alert] {tier_label} — DD VWCE {metrics['dd_12m']*100:+.1f}%"
        body = build_email_body(metrics, tier_label, tier_action)
        send_email(subject, body)
    else:
        print(f"\n✅ DD12M sopra soglia, nessun alert da inviare. Silenzio.")

if __name__ == '__main__':
    main()
