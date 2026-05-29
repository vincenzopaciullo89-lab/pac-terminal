"""Tests per .github/scripts/fetch_prices.py (TASK 0 — bug NaN).

Esegue con:
    python -m unittest discover -s tests -p 'test_*.py'

Strategia:
  - I 4 test su `fetch_yf_price` coprono il bug "trailing NaN":
    yfinance restituisce nella history una riga finale per la sessione
    corrente non ancora consolidata, con Close = NaN. Il codice rotto
    fa float(NaN) → ritorna nan come prezzo valido.
  - Il test integrazione su `fetch_current_for_ticker` dimostra che,
    a fronte di yfinance con trailing-NaN, il fallback Google Sheets
    deve scattare e produrre un record valido (oggi non scatta).
  - Il test health garantisce che ≥3 fallimenti consecutivi alzino
    `alert_needed`.
  - Il test JSON garantisce che NaN non possa essere serializzato in
    modo silenzioso (allow_nan=False).
"""
import json
import math
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / ".github" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
import fetch_prices  # noqa: E402


def _make_hist(rows):
    """rows = [('2026-05-26', 162.77), ('2026-05-27', float('nan'))]"""
    if not rows:
        return pd.DataFrame()
    idx = pd.DatetimeIndex([pd.Timestamp(d) for d, _ in rows])
    closes = [c for _, c in rows]
    return pd.DataFrame({"Close": closes}, index=idx)


def _mock_ticker(hist):
    m = MagicMock()
    m.history.return_value = hist
    m.info = {}
    return m


class FetchYfPriceTests(unittest.TestCase):
    @patch("fetch_prices.yf.Ticker")
    def test_returns_last_close_when_all_valid(self, mock_tk):
        mock_tk.return_value = _mock_ticker(_make_hist([
            ("2026-05-25", 160.00),
            ("2026-05-26", 162.77),
        ]))
        price, _ = fetch_prices.fetch_yf_price("VWCE.MI")
        self.assertEqual(price, 162.77)

    @patch("fetch_prices.yf.Ticker")
    def test_returns_last_finite_when_trailing_nan(self, mock_tk):
        # IL CASO DEL BUG: ultima riga è NaN (sessione corrente non chiusa),
        # la penultima è valida. Deve ritornare quella valida.
        mock_tk.return_value = _mock_ticker(_make_hist([
            ("2026-05-25", 160.00),
            ("2026-05-26", 162.77),
            ("2026-05-27", float("nan")),
        ]))
        price, _ = fetch_prices.fetch_yf_price("VWCE.MI")
        self.assertTrue(math.isfinite(price))
        self.assertEqual(price, 162.77)

    @patch("fetch_prices.yf.Ticker")
    def test_raises_when_all_nan(self, mock_tk):
        mock_tk.return_value = _mock_ticker(_make_hist([
            ("2026-05-25", float("nan")),
            ("2026-05-26", float("nan")),
        ]))
        with self.assertRaises(RuntimeError):
            fetch_prices.fetch_yf_price("VWCE.MI")

    @patch("fetch_prices.yf.Ticker")
    def test_raises_when_history_empty(self, mock_tk):
        mock_tk.return_value = _mock_ticker(_make_hist([]))
        with self.assertRaises(RuntimeError):
            fetch_prices.fetch_yf_price("VWCE.MI")


class FetchCurrentForTickerNanIntegrationTests(unittest.TestCase):
    """Integrazione su scenario reale del bug:
      - trailing-NaN + close precedente valido → usa il close valido,
        no fallback (sul codice rotto restituirebbe NaN);
      - TUTTI i close NaN → fallback Google Sheets scatta
        (sul codice rotto restituiva un record con NaN, source='yfinance');
      - yfinance NaN + Sheets irraggiungibile → FAILED (counter sale).
    """
    INFO = {"yf": "VWCE.MI", "sheets": "VWCE.MI", "currency": "EUR"}

    @patch("fetch_prices.fetch_sheets_current")
    @patch("fetch_prices.yf.Ticker")
    def test_trailing_nan_uses_previous_valid_close(self, mock_tk, mock_sheets):
        mock_tk.return_value = _mock_ticker(_make_hist([
            ("2026-05-26", 162.77),
            ("2026-05-27", float("nan")),
        ]))
        mock_sheets.return_value = (999.99, "EUR")  # non deve essere usato
        rec, src = fetch_prices.fetch_current_for_ticker("VWCE", self.INFO, None)
        self.assertEqual(src, "yfinance")
        self.assertIsNotNone(rec)
        self.assertEqual(rec["source"], "yfinance")
        self.assertEqual(rec["price_eur"], 162.77)
        self.assertTrue(math.isfinite(rec["price_native"]))
        mock_sheets.assert_not_called()

    @patch("fetch_prices.fetch_sheets_current")
    @patch("fetch_prices.yf.Ticker")
    def test_all_nan_triggers_sheets_fallback(self, mock_tk, mock_sheets):
        mock_tk.return_value = _mock_ticker(_make_hist([
            ("2026-05-26", float("nan")),
            ("2026-05-27", float("nan")),
        ]))
        mock_sheets.return_value = (160.50, "EUR")
        rec, src = fetch_prices.fetch_current_for_ticker("VWCE", self.INFO, None)
        self.assertEqual(src, "google_sheets")
        self.assertIsNotNone(rec)
        self.assertEqual(rec["source"], "google_sheets")
        self.assertEqual(rec["price_eur"], 160.50)
        self.assertTrue(math.isfinite(rec["price_native"]))

    @patch("fetch_prices.fetch_sheets_current")
    @patch("fetch_prices.yf.Ticker")
    def test_yf_nan_and_sheets_unreachable_returns_failed(self, mock_tk, mock_sheets):
        mock_tk.return_value = _mock_ticker(_make_hist([
            ("2026-05-27", float("nan")),
        ]))
        mock_sheets.side_effect = RuntimeError("sheets_unreachable")
        rec, src = fetch_prices.fetch_current_for_ticker("VWCE", self.INFO, None)
        self.assertIsNone(rec)
        self.assertEqual(src, "FAILED")


class HealthRecordingTests(unittest.TestCase):
    def test_record_failure_streak_triggers_alert_at_threshold(self):
        health = {"tickers": {}}
        rec = fetch_prices._ticker_record(health, "VWCE")
        for i in range(1, fetch_prices.FAILURE_THRESHOLD_FOR_ALERT + 1):
            fetch_prices._record_failure(rec)
            self.assertEqual(rec["consecutive_failures"], i)
            expected_alert = i >= fetch_prices.FAILURE_THRESHOLD_FOR_ALERT
            self.assertEqual(rec["alert_needed"], expected_alert,
                             f"streak {i}: alert atteso {expected_alert}")


class JsonOutputTests(unittest.TestCase):
    def test_json_dumps_with_nan_raises_in_strict_mode(self):
        record = {"price_native": float("nan"), "price_eur": float("nan")}
        with self.assertRaises(ValueError):
            json.dumps(record, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
