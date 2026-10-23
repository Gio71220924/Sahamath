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
# HAR per definisi variance harian: gk = Garman-Klass + gap semalam (meremehkan hari tren
# open→close, mis. ARA/ARB), r2 = return close² (noisy), mix = rata-rata keduanya.
HAR_MODELS = {"har": "gk", "har_r2": "r2", "har_mix": "mix"}
MODELS = ["cc20", "yz20", *HAR_MODELS]
RV_FLOOR = 1e-8  # hari tanpa gerak (H=L=O=C) → log tidak -inf
BIG_MOVE = 0.08  # subset "setelah gerak besar": ada |return harian| >= 8% dalam 5 hari terakhir


def har_cols(v):
    return [f"{v}_d", f"{v}_w", f"{v}_m"]


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
        r = C.diff()
        gk = over ** 2 + 0.5 * (Hh - L) ** 2 - (2 * np.log(2) - 1) * oc ** 2
        cols = {
            "ticker": jk.removesuffix(".JK"),
            "close": df["Close"],
            "value": (df["Close"] * df["Volume"]).rolling(20).mean(),
            "fwd": C.shift(-H) - C,
            "big_move": r.abs().rolling(5).max() >= BIG_MOVE,
            "sig_cc20": r.rolling(WINDOW).std(),
            "sig_yz20": yang_zhang(over, oc, rs),
        }
        for v, rv in {"gk": gk, "r2": r ** 2, "mix": 0.5 * (gk + r ** 2)}.items():
            rv = rv.clip(lower=RV_FLOOR)
            cols[f"{v}_d"] = np.log(rv)
            cols[f"{v}_w"] = np.log(rv.rolling(5).mean())
            cols[f"{v}_m"] = np.log(rv.rolling(22).mean())
            cols[f"y_{v}"] = np.log(rv[::-1].rolling(H).mean()[::-1].shift(-1))  # mean RV t+1..t+H
        frames.append(pd.DataFrame(cols, index=pd.to_datetime(df.index).normalize()))

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

        tr_sig = {"cc20": tr["sig_cc20"], "yz20": tr["sig_yz20"]}
        te_sig = {"cc20": te["sig_cc20"], "yz20": te["sig_yz20"]}
        for m, v in HAR_MODELS.items():
            beta = fit_har(tr, v)
            tr_sig[m], te_sig[m] = har_sigma(tr, v, beta), har_sigma(te, v, beta)

        for m in MODELS:
            k = scale_for(tr["fwd"] / (tr_sig[m] * np.sqrt(H)))  # kalibrasi global di train
            te[f"half_{m}"] = Z * k * te_sig[m] * np.sqrt(H)
        te["fold"] = str(dates[start].date())
        out.append(te)
        print(f"fold {dates[start].date()} selesai")
    return pd.concat(out)


def fit_har(df, v):
    A = np.column_stack([np.ones(len(df)), df[har_cols(v)].values])
    beta, *_ = np.linalg.lstsq(A, df[f"y_{v}"].values, rcond=None)
    return beta


def har_sigma(df, v, beta):
    return np.sqrt(np.exp(np.column_stack([np.ones(len(df)), df[har_cols(v)].values]) @ beta))


def score(df, m):
    half = df[f"half_{m}"]
    miss = (df["fwd"].abs() - half).clip(lower=0)
    return pd.Series({"coverage": (df["fwd"].abs() <= half).mean(),
                      "lebar%": (2 * half).mean() * 100,
                      "winkler": (2 * half + 2 / ALPHA * miss).mean() * 100})


def report(res):
    big = res["big_move"].astype(bool)
    for label, part in [("dev (proxy IDX100)", res[res["dev"]]), ("holdout (saham lain)", res[~res["dev"]]),
                        ("dev setelah gerak besar", res[res["dev"] & big]),
                        ("holdout setelah gerak besar", res[~res["dev"] & big])]:
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
    print("\n== Konstanta final (semua data dev)")
    for m, v in HAR_MODELS.items():
        beta = fit_har(dev, v)
        k = scale_for(dev["fwd"] / (har_sigma(dev, v, beta) * np.sqrt(H)))
        print(f"{m}: HAR_BETA = {np.round(beta, 4).tolist()}, HAR_SCALE = {k:.4f}")


def main():
    panel = load()
    print(f"{panel['ticker'].nunique()} saham, {panel.index.nunique()} hari, "
          f"{panel['dev'].sum()} dev / {(~panel['dev']).sum()} holdout")
    report(run(panel))
    final_fit(panel)


if __name__ == "__main__":
    main()
