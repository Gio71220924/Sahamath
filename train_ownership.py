"""Eksperimen sinyal kepemilikan KSEI (asing / ritel / institusi lokal / reksa dana) -> return bulan depan.

Data: arsip bulanan KSEI Balancepos (komposisi kepemilikan per saham per tipe investor, lokal vs
asing), di-cache di .cache/ksei/. Likuiditas dari cache OHLCV train.py.

Point-in-time: file bulan m terbit di bulan m+1, jadi sinyal bulan m dipakai untuk return
akhir m+1 -> akhir m+2 (lag 1). Lag 0 cuma pembanding (tidak realistis, ngintip ~1 bulan).
Return bulanan dari harga akhir bulan di file KSEI; bulan dengan perubahan jumlah saham > 10%
(split / right issue / bonus) dibuang. Dividen tidak dihitung.

Uji per sinyal, cross-section bulanan saham likuid:
- Rank IC (Spearman sinyal vs return), rata-rata + t-stat
- Q5 (sinyal tertinggi) dan Q1 minus rata-rata universe; Q5 net fee FEE% x turnover
Banyak sinyal diuji sekaligus → menarik hanya kalau |t| >= 2.5 dan tanda sama di dua paruh sampel.
Belum export model. Run: python train_ownership.py
"""
import calendar
import io
import os
import zipfile

import numpy as np
import pandas as pd
import requests

from train import download_ohlcv

KSEI = "https://web.ksei.co.id/Download/BalanceposEfek{}.zip"
CACHE_DIR = os.path.join(".cache", "ksei")
START = (2020, 12)
FEE = 0.25  # % round-trip (broker murah: 0.10 beli + 0.15 jual)
MIN_VALUE = 5e9
MIN_PRICE = 100
TYPES = ["IS", "CP", "PF", "IB", "ID", "MF", "SC", "FD", "OT"]
COLS = (["date", "code", "type", "sec_num", "price"] + [f"L_{t}" for t in TYPES] + ["L_total"]
        + [f"F_{t}" for t in TYPES] + ["F_total"])
GROUPS = {"foreign": ["F_total"], "retail": ["L_ID"], "local_inst": ["L_IS", "L_PF", "L_MF", "L_IB"], "mf": ["L_MF"]}


def month_file(year, month):
    """File KSEI = hari bursa terakhir bulan itu; coba mundur dari tanggal terakhir."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    last = calendar.monthrange(year, month)[1]
    stamps = [f"{year}{month:02d}{d:02d}" for d in range(last, last - 7, -1)]
    for s in stamps:
        if os.path.exists(os.path.join(CACHE_DIR, f"{s}.zip")):
            return os.path.join(CACHE_DIR, f"{s}.zip")
    for s in stamps:
        r = requests.get(KSEI.format(s), headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
        if r.ok and r.content[:2] == b"PK":
            with open(os.path.join(CACHE_DIR, f"{s}.zip"), "wb") as f:
                f.write(r.content)
            return os.path.join(CACHE_DIR, f"{s}.zip")
    return None


def load_ksei():
    today = pd.Timestamp.today()
    frames, (y, m) = [], START
    while (y, m) < (today.year, today.month):
        path = month_file(y, m)
        if path:
            with zipfile.ZipFile(path) as z:
                df = pd.read_csv(io.BytesIO(z.read(z.namelist()[0])), sep="|", names=COLS, header=0)
            df = df[df["type"].str.strip() == "EQUITY"].copy()
            df["month"] = pd.Period(f"{y}-{m:02d}", "M")
            frames.append(df)
        else:
            print(f"KSEI {y}-{m:02d} tidak ada")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    k = pd.concat(frames, ignore_index=True)
    k["code"] = k["code"].str.strip()
    held = k["L_total"] + k["F_total"]
    k, held = k[held > 0].copy(), held[held > 0]
    for name, cols in GROUPS.items():
        k[name] = k[cols].sum(axis=1) / held
    months = pd.period_range(k["month"].min(), k["month"].max(), freq="M")
    wide = lambda col: k.pivot_table(index="month", columns="code", values=col, aggfunc="last").reindex(months)
    return {c: wide(c) for c in ["price", "sec_num", *GROUPS]}


def liquidity(codes, months):
    raw = download_ohlcv()
    out = {}
    for jk in raw.columns.get_level_values(0).unique():
        code = jk.removesuffix(".JK")
        if code not in codes:
            continue
        df = raw[jk][["Close", "Volume"]].apply(pd.to_numeric, errors="coerce").dropna()
        value = (df["Close"] * df["Volume"]).rolling(20).mean()
        value.index = pd.to_datetime(value.index)
        out[code] = value.resample("ME").last().to_period("M")
    return pd.DataFrame(out).reindex(index=months, columns=sorted(codes))


def residual(y, x):
    """Sisa y setelah regresi cross-section ke x tiap bulan (buang efek x, mis. ukuran)."""
    xm, ym = x.sub(x.mean(axis=1), axis=0), y.sub(y.mean(axis=1), axis=0)
    ok = xm.notna() & ym.notna()
    beta = (xm * ym).where(ok).sum(axis=1) / (xm ** 2).where(ok).sum(axis=1)
    return ym - xm.mul(beta, axis=0)


def signals(w):
    log_mcap = np.log(w["sec_num"] * w["price"]).replace([np.inf, -np.inf], np.nan)
    sig = {"level_foreign": w["foreign"], "log_mcap": log_mcap,
           "foreign_ex_size": residual(w["foreign"], log_mcap)}
    for g in GROUPS:
        sig[f"d_{g}_1m"] = w[g].diff()
        sig[f"d_{g}_3m"] = w[g].diff(3)
    return sig


def evaluate(sig, fwd, universe):
    rows, prev_top = [], set()
    for month in sig.index:
        s, f = sig.loc[month], fwd.loc[month]
        ok = universe.loc[month] & s.notna() & f.notna()
        if ok.sum() < 50:
            continue
        s, f = s[ok], f[ok]
        q = pd.qcut(s.rank(method="first"), 5, labels=False)
        top = set(s.index[q == 4])
        turnover = 1 - len(top & prev_top) / len(top) if prev_top else 1.0
        prev_top = top
        rows.append({"month": month, "ic": s.rank().corr(f.rank()),
                     "q5": (f[q == 4].mean() - f.mean()) * 100 - FEE * turnover,
                     "q1": (f[q == 0].mean() - f.mean()) * 100, "n": ok.sum()})
    return pd.DataFrame(rows)


def tstat(x):
    return x.mean() / x.std() * np.sqrt(len(x)) if len(x) > 2 and x.std() > 0 else np.nan


def main():
    w = load_ksei()
    codes = sorted(w["price"].columns)
    w = {k: v.reindex(columns=codes) for k, v in w.items()}
    months = w["price"].index
    ret = w["price"].pct_change(fill_method=None)
    ret[w["sec_num"].pct_change(fill_method=None).abs() > 0.10] = np.nan  # aksi korporasi
    value = liquidity(set(codes), months)
    universe = (value >= MIN_VALUE) & (w["price"] >= MIN_PRICE)
    per_month = universe.sum(axis=1)
    print(f"KSEI {months[0]}..{months[-1]}, {len(codes)} saham, universe rata2 "
          f"{per_month[per_month > 0].mean():.0f} saham likuid/bulan")

    table = []
    for lag, shift in [("lag1", -2), ("lag0 (ngintip)", -1)]:
        fwd = ret.shift(shift)
        for name, s in signals(w).items():
            r = evaluate(s, fwd, universe)
            if r.empty:
                continue
            half = len(r) // 2
            same = np.sign(r["ic"][:half].mean()) == np.sign(r["ic"][half:].mean())
            table.append({"lag": lag, "sinyal": name, "bulan": len(r),
                          "IC": r["ic"].mean(), "IC_t": tstat(r["ic"]),
                          "Q5-univ net%/bln": r["q5"].mean(), "Q5_t": tstat(r["q5"]),
                          "Q1-univ%/bln": r["q1"].mean(), "Q1_t": tstat(r["q1"]),
                          "stabil 2 paruh": "ya" if same else "tidak"})
    out = pd.DataFrame(table)
    print(out.round(3).to_string(index=False))
    hits = out[(out["lag"] == "lag1") & (out["IC_t"].abs() >= 2.5) & (out["stabil 2 paruh"] == "ya")]
    print("\nLolos (lag1, |IC t| >= 2.5, stabil):", ", ".join(hits["sinyal"]) or "tidak ada")

    sig = signals(w)
    for name in ["level_foreign", "foreign_ex_size", "log_mcap"]:
        r = evaluate(sig[name], ret.shift(-2), universe)
        yearly = r.groupby(r["month"].dt.year)["ic"].mean().round(3).to_dict()
        print(f"IC per tahun {name}: {yearly}")


if __name__ == "__main__":
    main()
