"""watchlist.py — batch quotes + 7-day sparkline for the user's watchlist.

Usage:  python watchlist.py BBRI,GOTO,TLKM
Output: {"status":"ok","quotes":{"BBRI":{"price":4120.0,"pct":1.2,"spark":[...]}}}

One yf.download() for all tickers (mirrors heatmap.py's batch pattern).
"""
import sys
import json

import yfinance as yf
import pandas as pd


def fetch(tickers):
    if not tickers:
        return {}
    jk = [t + '.JK' for t in tickers]
    df = yf.download(
        jk, period='1mo', interval='1d',
        progress=False, auto_adjust=False, group_by='ticker',
    )
    out = {}
    for t in tickers:
        try:
            sub = df[t + '.JK'] if isinstance(df.columns, pd.MultiIndex) else df
            closes = sub['Close'].dropna()
            if len(closes) < 2:
                continue
            last = float(closes.iloc[-1])
            prev = float(closes.iloc[-2])
            pct = (last / prev - 1) * 100 if prev > 0 else 0.0
            spark = [round(float(x), 2) for x in closes.iloc[-7:].tolist()]
            # rata-rata nilai transaksi harian (Rp), dipakai syarat likuid kandidat capture dividen
            value = (sub['Close'] * sub['Volume']).dropna().tail(20).mean()
            out[t] = {'price': round(last, 2), 'pct': round(pct, 2), 'spark': spark,
                      'value': round(float(value)) if pd.notna(value) else None}
        except Exception:
            pass
    return out


if __name__ == '__main__':
    raw = sys.argv[1] if len(sys.argv) > 1 else ''
    tickers = [t.strip().upper() for t in raw.split(',') if t.strip()]
    try:
        print(json.dumps({'status': 'ok', 'quotes': fetch(tickers)}))
    except Exception as e:
        print(json.dumps({'status': 'error', 'message': str(e)}))
