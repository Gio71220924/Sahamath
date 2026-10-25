"""dividend_history.py — riwayat event dividen untuk dividend capture.

Usage:  python dividend_history.py BBRI
Output: {"status":"ok","ticker":"BBRI","events":[{"ex":"2026-04-01","cum_close":4000.0,"ex_close":3900.0,"amount":150.0}]}

Harga mentah (auto_adjust=False), sama dengan riset train_anomalies.py: beli di close cum date
(bursa H-1), jual di close ex date. Hasil bersih (pajak, fee) dihitung di browser supaya ikut
fee broker pengguna. Server cache 24 jam per ticker.
"""
import json
import sys

import yfinance as yf

PERIOD = '6y'
MAX_JUMP = 0.35  # lompatan cum→ex lebih dari ini = split/data rusak, bukan efek dividen


def naive_day(ts):
    return (ts.tz_localize(None) if ts.tzinfo else ts).normalize()


def events(ohlcv, dividends):
    # hari tanpa transaksi (Volume 0) = harga diisi ulang yfinance, bukan close sungguhan
    close = ohlcv.loc[ohlcv['Volume'] > 0, 'Close'].copy()
    close.index = [naive_day(t) for t in close.index]
    out = []
    for ex, amount in dividends.items():
        ex = naive_day(ex)
        if ex not in close.index:
            continue
        i = close.index.get_loc(ex)
        if i == 0:
            continue
        cum, exc = float(close.iloc[i - 1]), float(close.iloc[i])
        if cum <= 0 or abs(exc / cum - 1) > MAX_JUMP:
            continue
        out.append({'ex': ex.date().isoformat(), 'cum_close': cum, 'ex_close': exc, 'amount': round(float(amount), 2)})
    return out


def fetch(ticker):
    tk = yf.Ticker(ticker + '.JK')
    ohlcv = tk.history(period=PERIOD, auto_adjust=False)
    return events(ohlcv, tk.dividends) if not ohlcv.empty else []  # kode tidak dikenal Yahoo


if __name__ == '__main__':
    t = (sys.argv[1] if len(sys.argv) > 1 else '').upper().strip()
    try:
        if not t:
            raise ValueError('ticker required')
        print(json.dumps({'status': 'ok', 'ticker': t, 'events': fetch(t)}))
    except Exception as e:
        print(json.dumps({'status': 'error', 'message': str(e)}))
