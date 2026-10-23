"""Uji adil: LightGBM + SEMUA indikator app + tuning, untuk peluang TP duluan (lanjutan train_tp.py).

Anti-overfit tuning: grid dipilih HANYA di 5 fold pertama (validasi), lalu dibekukan dan
dinilai di fold sisanya yang belum pernah dilihat. Fit di proxy IDX100, nilai juga di holdout.
Pertanyaan praktis: kalau cuma ambil 10% plan dengan P(TP) tertinggi, untung setelah fee?
P&L per plan: TP = +2xATR%, SL = -1.5xATR%, timeout = return close N hari, minus fee round-trip.
(optimis: anggap fill pas di level TP/SL, abaikan gap.)
Belum export model. Run: python train_tp_lgbm.py
"""
import itertools

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier

from predict import FEE_BUFFER_PCT
from train import EXTRA, MIN_TRAIN_DAYS, OHLCV, TEST_DAYS, load_panel
from train_tp import CLASSES, MIN_PRICE, MIN_VALUE, N, SL_ATR, TOP_N, TP_ATR, brier, outcome

TUNE_FOLDS = 5
GRID = [dict(num_leaves=nl, min_child_samples=mcs, n_estimators=ne, learning_rate=0.05)
        for nl, mcs, ne in itertools.product([7, 31], [200, 1000], [100, 300])]


def build():
    panel, _ = load_panel()
    parts = []
    for _, df in panel.groupby("ticker", sort=False):
        df = df.copy()
        df["y"] = outcome(df, df["ATR"])
        df["ret_n"] = df["Close"].shift(-N) / df["Close"] - 1
        parts.append(df)
    panel = pd.concat(parts)
    panel = panel[(panel["VALUE_MA20"] >= MIN_VALUE) & (panel["Close"] >= MIN_PRICE)]
    features = [c for c in panel.columns if c not in OHLCV + EXTRA + ["y", "ret_n"]]
    panel = panel.dropna(subset=["y", "ret_n", "ATR_pct"]).copy()
    panel["y"] = panel["y"].astype(int)
    panel["dev"] = panel.groupby(level="date")["VALUE_MA20"].rank(ascending=False) <= TOP_N
    # rank per tanggal → saham mahal vs murah sebanding; ATR_pct mentah tetap ikut
    X = panel.groupby(level="date")[features].rank(pct=True).fillna(0.5)
    X["ATR_pct_raw"] = panel["ATR_pct"]
    pnl = np.select([panel["y"] == 0, panel["y"] == 1],
                    [TP_ATR * panel["ATR_pct"], -SL_ATR * panel["ATR_pct"]], panel["ret_n"])
    panel["pnl%"] = pnl * 100 - FEE_BUFFER_PCT
    return panel, X


def folds(dates):
    for i, start in enumerate(range(MIN_TRAIN_DAYS, len(dates) - N, TEST_DAYS)):
        yield i, dates[start - N - 1], dates[start:start + TEST_DAYS]


def fit_predict(params, X_tr, y_tr, X_te):
    model = LGBMClassifier(verbose=-1, random_state=0, **params)
    model.fit(X_tr, y_tr)
    return model.predict_proba(X_te)


def run(panel, X):
    dates = panel.index.unique().sort_values()
    tune_scores = np.zeros(len(GRID))
    best, out = None, []
    for i, train_end, test_dates in folds(dates):
        tr = (panel.index <= train_end) & panel["dev"].values
        te = panel.index.isin(test_dates)
        freq = np.bincount(panel.loc[tr, "y"], minlength=3) / tr.sum()
        res = panel.loc[te, ["y", "dev", "pnl%"]].copy()
        res[[f"const_{c}" for c in CLASSES]] = freq

        if i < TUNE_FOLDS:  # validasi: pilih grid di sini, hasil fold ini tidak ikut dinilai
            val = res[res["dev"]]
            for g, params in enumerate(GRID):
                res[[f"lgbm_{c}" for c in CLASSES]] = fit_predict(params, X[tr], panel.loc[tr, "y"], X[te])
                tune_scores[g] += 1 - brier(res[res["dev"]], "lgbm") / brier(val, "const")
            print(f"tune fold {test_dates[0].date()} selesai")
            continue

        if best is None:
            best = GRID[int(tune_scores.argmax())]
            print(f"grid terbaik (rata2 skill validasi {tune_scores.max() / TUNE_FOLDS:+.2%}): {best}")
        res[[f"lgbm_{c}" for c in CLASSES]] = fit_predict(best, X[tr], panel.loc[tr, "y"], X[te])
        out.append(res)
        print(f"eval fold {test_dates[0].date()} selesai")
    return pd.concat(out)


def report(res):
    for label, part in [("dev (proxy IDX100)", res[res["dev"]]), ("holdout (saham lain)", res[~res["dev"]])]:
        base = brier(part, "const")
        print(f"\n== {label}: {len(part)} plan (fold eval saja)")
        print(f"  lgbm brier skill vs const {1 - brier(part, 'lgbm') / base:+.2%}")
        dec = pd.qcut(part["lgbm_TP"], 10, labels=False, duplicates="drop")
        tab = part.groupby(dec).agg(pred_TP=("lgbm_TP", "mean"),
                                    nyata_TP=("y", lambda y: (y == 0).mean()),
                                    nyata_SL=("y", lambda y: (y == 1).mean()),
                                    pnl_pct=("pnl%", "mean"), n=("y", "size"))
        print(tab.round(3).to_string())
        print(f"  semua plan: rata2 P&L {part['pnl%'].mean():+.3f}% | "
              f"top 10% model: {tab['pnl_pct'].iloc[-1]:+.3f}% per plan (setelah fee {FEE_BUFFER_PCT}%)")


def main():
    panel, X = build()
    print(f"{panel['ticker'].nunique()} saham, {X.shape[1]} fitur, {len(panel)} plan")
    report(run(panel, X))


if __name__ == "__main__":
    main()
