"""Eksperimen estimator volatilitas untuk kisaran harga 5 hari (80%), walk-forward.

Model (semua lognormal tanpa drift; beda di sigma harian):
- cc20 : std return close-to-close 20 hari (yang live di predict.price_range).
- yz20 : Yang-Zhang 20 hari (overnight + open-close + Rogers-Satchell), pakai OHLC.
- har  : HAR (Corsi 2009) di variance harian OHLC: log RV 1d/5d/22d -> log RV 5 hari ke depan,
         OLS pooled di-fit ulang tiap fold.
Semua dikalibrasi satu skala global di data train (coverage 80%), jadi yang dinilai ketajaman:
Winkler interval score (lebih kecil = lebih baik) + berapa fold yang menang vs cc20.

Universe & waktu sama dengan train_regime.py (dev = proxy IDX100, holdout = saham lain).
Belum export model. Run: python train_vol.py
"""
import numpy as np
import pandas as pd

from train import MIN_TRAIN_DAYS, TEST_DAYS, download_ohlcv
from train_regime import ALPHA, MIN_PRICE, MIN_VALUE, TOP_N, Z, H, scale_for

WINDOW = 20
MODELS = ["cc20", "yz20", "har"]
HAR_COLS = ["lrv_d", "lrv_w", "lrv_m"]
RV_FLOOR = 1e-8  # hari tanpa gerak (H=L=O=C) → log tidak -inf


def yang_zhang(o, c, rs, n=WINDOW):
    k = 0.34 / (1.34 + (n + 1) / (n - 1))
    return np.sqrt(o.rolling(n).var() + k * c.rolling(n).var() + (1 - k) * rs.rolling(n).mean())


def load():
    raw = download_ohlcv()
    frames = []
    for jk in raw.columns.get_level_values(0).unique():
        df = raw[jk][["Open", "High", "Low", "Close", "Volume"]].apply(pd.to_numeric, errors="coerce").dropna()
        df = df[(df["Volume"] > 0) & (df[["Open", "High", "Low", "Close"]] > 0).all(axis=1)]
        if len(df) < MIN_TRAIN_DAYS:
            continue
        O, Hh, L, C = (np.log(df[c]) for c in ["Open", "High", "Low", "Close"])
        over = O - C.shift(1)                      # gap semalam
        oc = C - O                                 # open → close
        rs = (Hh - C) * (Hh - O) + (L - C) * (L - O)  # Rogers-Satchell
        rv = (over ** 2 + 0.5 * (Hh - L) ** 2 - (2 * np.log(2) - 1) * oc ** 2).clip(lower=RV_FLOOR)
        frames.append(pd.DataFrame({
            "ticker": jk.removesuffix(".JK"),
            "close": df["Close"],
            "value": (df["Close"] * df["Volume"]).rolling(20).mean(),
            "fwd": C.shift(-H) - C,
            "sig_cc20": C.diff().rolling(WINDOW).std(),
            "sig_yz20": yang_zhang(over, oc, rs),
            "lrv_d": np.log(rv),
            "lrv_w": np.log(rv.rolling(5).mean()),
            "lrv_m": np.log(rv.rolling(22).mean()),
            "y_har": np.log(rv[::-1].rolling(H).mean()[::-1].shift(-1)),  # mean RV t+1..t+H
        }, index=pd.to_datetime(df.index).normalize()))

    panel = pd.concat(frames).replace([np.inf, -np.inf], np.nan).dropna()
    panel.index.name = "date"
    panel = panel[(panel["value"] >= MIN_VALUE) & (panel["close"] >= MIN_PRICE)
                  & (panel["sig_cc20"] > 0) & (panel["sig_yz20"] > 0) & (panel["fwd"].abs() < 1)]
    panel["dev"] = panel.groupby(level="date")["value"].rank(ascending=False) <= TOP_N
    return panel


def run(panel):
    dates = panel.index.unique().sort_values()
    out = []
    for start in range(MIN_TRAIN_DAYS, len(dates) - H, TEST_DAYS):
        train_end = dates[start - H - 1]
        tr = panel[(panel.index <= train_end) & panel["dev"]]
        te = panel[panel.index.isin(dates[start:start + TEST_DAYS])].copy()

        A = np.column_stack([np.ones(len(tr)), tr[HAR_COLS].values])
        beta, *_ = np.linalg.lstsq(A, tr["y_har"].values, rcond=None)
        har = lambda d: np.sqrt(np.exp(np.column_stack([np.ones(len(d)), d[HAR_COLS].values]) @ beta))
        tr_sig = {"cc20": tr["sig_cc20"], "yz20": tr["sig_yz20"], "har": har(tr)}
        te_sig = {"cc20": te["sig_cc20"], "yz20": te["sig_yz20"], "har": har(te)}

        for m in MODELS:
            k = scale_for(tr["fwd"] / (tr_sig[m] * np.sqrt(H)))  # kalibrasi global di train
            te[f"half_{m}"] = Z * k * te_sig[m] * np.sqrt(H)
        te["fold"] = str(dates[start].date())
        out.append(te)
        print(f"fold {dates[start].date()}  HAR beta d/w/m {np.round(beta[1:], 2)}")
    return pd.concat(out)


def score(df, m):
    half = df[f"half_{m}"]
    miss = (df["fwd"].abs() - half).clip(lower=0)
    return pd.Series({"coverage": (df["fwd"].abs() <= half).mean(),
                      "lebar%": (2 * half).mean() * 100,
                      "winkler": (2 * half + 2 / ALPHA * miss).mean() * 100})


def report(res):
    for label, part in [("dev (proxy IDX100)", res[res["dev"]]), ("holdout (saham lain)", res[~res["dev"]])]:
        print(f"\n== {label}: {len(part)} baris")
        table = pd.concat({m: score(part, m) for m in MODELS}, axis=1).T
        table["vs cc20"] = (1 - table["winkler"] / table.loc["cc20", "winkler"]).map("{:+.1%}".format)
        per_fold = part.groupby("fold").apply(
            lambda f: pd.Series({m: score(f, m)["winkler"] for m in MODELS}))
        table["fold menang"] = [f"{(per_fold[m] < per_fold['cc20']).sum()}/{len(per_fold)}" for m in MODELS]
        print(table.round(3).to_string())


def final_fit(panel):
    """Fit HAR + skala di semua data dev → konstanta untuk ditanam di predict.py (bukan pkl)."""
    dev = panel[panel["dev"]]
    A = np.column_stack([np.ones(len(dev)), dev[HAR_COLS].values])
    beta, *_ = np.linalg.lstsq(A, dev["y_har"].values, rcond=None)
    k = scale_for(dev["fwd"] / (np.sqrt(np.exp(A @ beta)) * np.sqrt(H)))
    print(f"\n== Konstanta final (semua data dev): HAR_BETA = {np.round(beta, 4).tolist()}, HAR_SCALE = {k:.4f}")


def main():
    panel = load()
    print(f"{panel['ticker'].nunique()} saham, {panel.index.nunique()} hari, "
          f"{panel['dev'].sum()} dev / {(~panel['dev']).sum()} holdout")
    report(run(panel))
    final_fit(panel)


if __name__ == "__main__":
    main()
