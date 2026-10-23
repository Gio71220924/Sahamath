"""Eksperimen range harga: prediksi P10/P50/P90 return HORIZON hari, walk-forward.

Pembanding:
- normal : vol 20 hari, lognormal tanpa drift. Ini hasil Monte Carlo GBM, tanpa perlu simulasi.
- hist   : kuantil return H-hari dalam 1 tahun terakhir saham itu (historical simulation).
- lgbm   : LightGBM quantile regression, semua fitur + HMM regime.

Metrik: coverage P10-P90 (target 80%), pinball loss (makin kecil makin bagus),
lebar range (makin sempit makin berguna, asal coverage tetap ~80%).
Universe: semua IDX likuid >= Rp5M/hari, harga >= Rp100. Belum export model.
Run: python train_range.py
"""
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from scipy.stats import norm

from train import EXTRA, HORIZON, N_REGIMES, OHLCV, load_panel, market_obs, regime_probs, walk_forward

QUANTILES = [0.1, 0.5, 0.9]
MODELS = ["normal", "hist", "lgbm"]
MIN_VALUE = 5e9
MIN_PRICE = 100
REGIME_NAMES = {0: "bearish", 1: "netral", 2: "bullish"}


def add_baselines(panel):
    by_ticker = panel.groupby("ticker")
    logret = by_ticker["Close"].transform(lambda s: np.log(s).diff())
    vol = logret.groupby(panel["ticker"]).transform(lambda s: s.rolling(20).std())
    past_ret = panel["Close"] / by_ticker["Close"].shift(HORIZON) - 1
    for q in QUANTILES:
        panel[f"normal_{q}"] = np.exp(norm.ppf(q) * vol * np.sqrt(HORIZON)) - 1
        panel[f"hist_{q}"] = past_ret.groupby(panel["ticker"]).transform(
            lambda s: s.rolling(250, min_periods=120).quantile(q))
    return panel


def pinball(y, pred, q):
    diff = y - pred
    return np.mean(np.maximum(q * diff, (q - 1) * diff))


def score(df, model):
    y = df["fwd_ret"]
    lo, hi = df[f"{model}_0.1"], df[f"{model}_0.9"]
    return {
        "coverage80": ((y >= lo) & (y <= hi)).mean(),
        "di_bawah_p10": (y < lo).mean(),
        "di_atas_p90": (y > hi).mean(),
        "lebar%": (hi - lo).mean() * 100,
        "pinball": np.mean([pinball(y, df[f"{model}_{q}"], q) for q in QUANTILES]) * 100,
    }


def main():
    panel_raw, market = load_panel()
    obs = market_obs(market)
    features = [c for c in panel_raw.columns if c not in OHLCV + EXTRA]

    panel = add_baselines(panel_raw.reset_index())
    panel = panel[(panel["VALUE_MA20"] >= MIN_VALUE) & (panel["Close"] >= MIN_PRICE)]
    baseline_cols = [f"{m}_{q}" for m in ["normal", "hist"] for q in QUANTILES]
    panel = (panel.dropna(subset=features + baseline_cols + ["fwd_ret"])
             .sort_values(["date", "ticker"]).reset_index(drop=True))
    dates = np.sort(panel["date"].unique())
    print(f"{panel['ticker'].nunique()} ticker, rata-rata {panel.groupby('date').size().mean():.0f}/hari, "
          f"horizon {HORIZON} hari")

    rows, tests = [], []
    for i, (train_dates, test_dates) in enumerate(walk_forward(dates)):
        tr = panel["date"].isin(train_dates).values
        te = panel["date"].isin(test_dates).values
        R = regime_probs(obs, pd.Timestamp(train_dates[-1])).reindex(
            pd.DatetimeIndex(panel["date"]), method="ffill").fillna(1 / N_REGIMES)
        X = pd.concat([panel[features], R.set_index(panel.index)], axis=1)

        preds = []
        for q in QUANTILES:
            model = LGBMRegressor(objective="quantile", alpha=q, n_estimators=300, learning_rate=0.05,
                                  num_leaves=31, min_child_samples=200, subsample=0.5,
                                  subsample_freq=1, verbose=-1)
            model.fit(X[tr], panel.loc[tr, "fwd_ret"])
            preds.append(model.predict(X[te]))
        preds = np.sort(np.column_stack(preds), axis=1)  # cegah kuantil silang (P10 > P50)

        test = panel[te].copy()
        for j, q in enumerate(QUANTILES):
            test[f"lgbm_{q}"] = preds[:, j]
        test["regime"] = R[te].values.argmax(axis=1)
        tests.append(test)
        for m in MODELS:
            rows.append({"fold": i, "model": m, **score(test, m)})
        print(f"fold {i:2d} {pd.Timestamp(test_dates[0]).date()} selesai")

    res = pd.DataFrame(rows)
    summary = res.drop(columns="fold").groupby("model", sort=False).mean()
    summary["coverage_std"] = res.groupby("model", sort=False)["coverage80"].std()
    print(f"\n== Range return {HORIZON} hari ==")
    print("target: coverage80 ~0.80, di_bawah_p10 & di_atas_p90 ~0.10, pinball & lebar makin kecil")
    print(summary.round(3).to_string())

    allt = pd.concat(tests)
    by_regime = pd.DataFrame({
        m: allt.groupby("regime").apply(lambda g: score(g, m)["coverage80"]) for m in MODELS})
    by_regime.index = by_regime.index.map(REGIME_NAMES)
    by_regime["n_hari"] = allt.groupby("regime")["date"].nunique().values
    print("\n== Coverage P10-P90 per regime HMM (target 0.80) ==")
    print(by_regime.round(3).to_string())


if __name__ == "__main__":
    main()
