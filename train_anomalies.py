"""Dua anomali klasik di IDX, horizon panjang (bukan swing harian):

A. Low volatility & MAX (lotre): tiap akhir bulan ranking saham likuid berdasarkan
   - vol60 : volatilitas harian 60 hari (Adj Close, termasuk dividen)
   - max21 : return harian terbesar 21 hari terakhir (efek "saham gorengan"/lotre)
   lalu pegang kuintil terendah 1 bulan. Banding rata-rata universe (equal weight), fee FEE% x turnover.
B. Dividen: event study sekitar ex-date (yfinance), saham likuid saat event.
   - run-up    : beli close H-11, jual close H-1 (cum date), minus IHSG di jendela sama
   - capture   : beli close H-1, jual close H (ex), + dividen x (1 - pajak 10%), minus IHSG
   - pasca ex  : close H sampai H+5, minus IHSG
Belum export model. Run: python train_anomalies.py
"""
import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import yfinance as yf

from train import PERIOD, download_ohlcv

FEE = 0.25        # % round-trip (broker murah 0.10 beli + 0.15 jual)
DIV_TAX = 0.10    # PPh final dividen individu
MIN_VALUE = 5e9
MIN_PRICE = 100
DIV_CACHE = os.path.join(".cache", "train", "dividends.pkl")


def panels():
    raw = download_ohlcv()
    get = lambda col: pd.DataFrame({jk.removesuffix(".JK"): pd.to_numeric(raw[jk][col], errors="coerce")
                                    for jk in raw.columns.get_level_values(0).unique()})
    close, adj, vol = get("Close"), get("Adj Close"), get("Volume")
    for df in (close, adj, vol):
        df.index = pd.to_datetime(df.index).normalize()
    traded = vol > 0
    value = (close * vol).where(traded).rolling(20, min_periods=15).mean()
    ret = adj.where(traded).pct_change(fill_method=None)
    ret = ret.where(ret.abs() < 0.5)  # >50% sehari = data rusak / aksi korporasi yang lolos adjust
    ihsg = yf.download("^JKSE", period=PERIOD, progress=False, auto_adjust=False)["Close"].squeeze()
    ihsg.index = pd.to_datetime(ihsg.index).normalize()
    return close, value, ret, ihsg.reindex(close.index).ffill()


def tstat(x):
    x = pd.Series(x).dropna()
    return x.mean() / x.std() * np.sqrt(len(x)) if len(x) > 2 and x.std() > 0 else np.nan


def anomaly_test(close, value, ret):
    month_end = close.index.to_series().groupby(close.index.to_period("M")).max()
    signals = {"vol60": ret.rolling(60, min_periods=45).std(), "max21": ret.rolling(21, min_periods=15).max()}
    monthly = (1 + ret.fillna(0)).groupby(close.index.to_period("M")).prod() - 1
    monthly = monthly.where(ret.groupby(close.index.to_period("M")).count() >= 10)
    print("\n== A. Low-vol & MAX, rebalance bulanan, pegang kuintil terendah")
    for name, sig in signals.items():
        rows, prev = [], set()
        for m, day in month_end.items():
            nxt = m + 1
            if nxt not in monthly.index:
                continue
            ok = (value.loc[day] >= MIN_VALUE) & (close.loc[day] >= MIN_PRICE) & sig.loc[day].notna() & monthly.loc[nxt].notna()
            if ok.sum() < 50:
                continue
            s, f = sig.loc[day][ok], monthly.loc[nxt][ok]
            q = pd.qcut(s.rank(method="first"), 5, labels=False)
            low = set(s.index[q == 0])
            turnover = 1 - len(low & prev) / len(low) if prev else 1.0
            prev = low
            rows.append({"month": nxt, "univ": f.mean() * 100,
                         "q1": f[q == 0].mean() * 100 - FEE * turnover, "q5": f[q == 4].mean() * 100,
                         "n": ok.sum()})
        r = pd.DataFrame(rows).set_index("month")
        ex1, ex5 = r["q1"] - r["univ"], r["q5"] - r["univ"]
        ann = lambda x: ((1 + x / 100).prod() ** (12 / len(x)) - 1) * 100
        vol = lambda x: x.std() * np.sqrt(12)
        print(f"\n{name}: {len(r)} bulan, rata2 {r['n'].mean():.0f} saham likuid")
        print(f"  Q1 (paling tenang) net  : {ann(r['q1']):+.1f}%/thn, vol {vol(r['q1']):.1f}%")
        print(f"  Universe (equal weight) : {ann(r['univ']):+.1f}%/thn, vol {vol(r['univ']):.1f}%")
        print(f"  Q5 (paling liar)        : {ann(r['q5']):+.1f}%/thn, vol {vol(r['q5']):.1f}%")
        print(f"  Q1-univ {ex1.mean():+.2f}%/bln (t {tstat(ex1):.2f}, menang {(ex1 > 0).mean():.0%} bulan) | "
              f"Q5-univ {ex5.mean():+.2f}%/bln (t {tstat(ex5):.2f})")
        print("  Q1-univ per tahun:", ex1.groupby(ex1.index.year).mean().round(2).to_dict())


def dividends(tickers):
    if os.path.exists(DIV_CACHE):
        # aman: file ini cuma ditulis oleh fungsi ini sendiri
        return pd.read_pickle(DIV_CACHE)
    fetch = lambda t: (t, yf.Ticker(t + ".JK").dividends)
    with ThreadPoolExecutor(8) as ex:
        out = {t: d for t, d in ex.map(fetch, tickers) if len(d)}
    rows = [(t, (d.tz_localize(None) if d.tzinfo else d).normalize(), v)
            for t, s in out.items() for d, v in s.items()]
    df = pd.DataFrame(rows, columns=["ticker", "ex", "amount"])
    os.makedirs(os.path.dirname(DIV_CACHE), exist_ok=True)
    df.to_pickle(DIV_CACHE)
    return df


def dividend_test(close, value, ihsg):
    liquid = [t for t in close.columns if (value[t] >= MIN_VALUE).any()]
    div = dividends(liquid)
    idx = close.index
    rows = []
    for t, ex, amt in div.itertuples(index=False):
        if t not in close.columns or ex not in idx:
            continue
        i = idx.get_loc(ex)
        if i < 11 or i + 5 >= len(idx):
            continue
        c = close[t]
        if not (value[t].iloc[i - 11] >= MIN_VALUE and c.iloc[i - 11] >= MIN_PRICE):
            continue
        rel = lambda a, b, extra=0.0: ((c.iloc[b] + extra) / c.iloc[a] - 1 - (ihsg.iloc[b] / ihsg.iloc[a] - 1)) * 100
        rows.append({"ticker": t, "ex": ex, "yield": amt / c.iloc[i - 1] * 100,
                     "runup": rel(i - 11, i - 1) - FEE,
                     # H-6: dividen hampir pasti sudah diumumkan (cum date ~8 hari bursa setelah RUPS)
                     "runup6": rel(i - 6, i - 1) - FEE,
                     "capture": rel(i - 1, i, amt * (1 - DIV_TAX)) - FEE,
                     "post": rel(i, i + 5)})
    ev = pd.DataFrame(rows).dropna()
    ev = ev[ev["yield"].between(0, 30)]
    print(f"\n== B. Dividen: {len(ev)} event, {ev['ticker'].nunique()} saham, {ev['ex'].min().date()}..{ev['ex'].max().date()}")
    for label, part in [("semua", ev), ("yield >= 3%", ev[ev["yield"] >= 3])]:
        print(f"  [{label}] n={len(part)}")
        for col, desc in [("runup", "run-up H-11..H-1, net fee"), ("runup6", "run-up H-6..H-1, net fee"),
                          ("capture", "beli H-1 jual H + div net pajak, net fee"),
                          ("post", "pasca ex H..H+5")]:
            x = part[col]
            print(f"    {desc:42s} rata2 {x.mean():+.2f}% median {x.median():+.2f}% t {tstat(x):.2f} positif {(x > 0).mean():.0%}")
    hi = ev[ev["yield"] >= 3]
    for col in ["runup", "runup6", "capture"]:
        print(f"  {col} yield>=3% per tahun:", hi.groupby(hi["ex"].dt.year)[col].agg(["mean", "size"]).round(2).to_dict("index"))


def main():
    close, value, ret, ihsg = panels()
    anomaly_test(close, value, ret)
    dividend_test(close, value, ihsg)


if __name__ == "__main__":
    main()
