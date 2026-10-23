"""Eksperimen regime HMM IHSG -> kisaran harga 5 hari per regime, walk-forward.

Pertanyaan: kalau sigma vol20 diskalakan per regime IHSG (HMM 3 state, filtered prob),
apakah kisaran 80% tetap kena ~80% di SEMUA regime dan lebih sempit saat pasar tenang?

Model (semua lognormal tanpa drift, beda di skala sigma):
- app    : vol20 apa adanya (yang live di predict.price_range).
- global : vol20 x satu skala, dikalibrasi di data train (efek kalibrasi ulang saja).
- regime : vol20 x skala per regime, dibobot filtered prob hari itu (efek regime).

Universe:
- dev     : proxy IDX100 = 100 saham nilai transaksi 20 hari terbesar, per tanggal (point-in-time).
            Skala di-fit di sini saja.
- holdout : saham likuid lain (>= Rp1M/hari, harga >= 50). Tidak pernah dipakai fit,
            jadi ini cek apakah berlaku ke semua saham IHSG.
Waktu: walk-forward expanding, HMM + skala di-fit ulang tiap kuartal pakai data <= train_end,
purge H+1 hari supaya return forward train tidak nyebrang ke test.

Metrik: coverage (target 0.80), lebar range (% log), Winkler interval score (lebih kecil = lebih baik).
Belum export model. Run: python train_regime.py
"""
import numpy as np
import pandas as pd
import yfinance as yf
from scipy.stats import norm

from train import MIN_TRAIN_DAYS, N_REGIMES, PERIOD, TEST_DAYS, download_ohlcv, market_obs, regime_probs

H = 5
ALPHA = 0.2
Z = norm.ppf(1 - ALPHA / 2)
TOP_N = 100
MIN_VALUE = 1e9
MIN_PRICE = 50
MIN_STATE_ROWS = 500
NAMES = ["tenang", "normal", "volatil"]
MODELS = ["app", "global", "regime"]


def load():
    raw = download_ohlcv()
    market = yf.download("^JKSE", period=PERIOD, interval="1d", progress=False, auto_adjust=False)
    if isinstance(market.columns, pd.MultiIndex):
        market.columns = market.columns.get_level_values(0)

    frames = []
    for jk in raw.columns.get_level_values(0).unique():
        df = raw[jk][["Close", "Volume"]].apply(pd.to_numeric, errors="coerce").dropna()
        df = df[(df["Volume"] > 0) & (df["Close"] > 0)]
        if len(df) < MIN_TRAIN_DAYS:
            continue
        logret = np.log(df["Close"]).diff()
        frames.append(pd.DataFrame({
            "ticker": jk.removesuffix(".JK"),
            "close": df["Close"],
            "vol20": logret.rolling(20).std(),
            "value": (df["Close"] * df["Volume"]).rolling(20).mean(),
            "fwd": np.log(df["Close"].shift(-H) / df["Close"]),
        }, index=pd.to_datetime(df.index).normalize()))

    panel = pd.concat(frames).dropna()
    panel.index.name = "date"
    # ponytail: |log ret 5d| > 1 hampir pasti split/reverse split (auto_adjust=False), bukan pasar
    panel = panel[(panel["value"] >= MIN_VALUE) & (panel["close"] >= MIN_PRICE)
                  & (panel["vol20"] > 0) & (panel["fwd"].abs() < 1)]
    panel["dev"] = panel.groupby(level="date")["value"].rank(ascending=False) <= TOP_N
    panel["z"] = panel["fwd"] / (panel["vol20"] * np.sqrt(H))  # return dalam satuan sigma vol20
    return panel, market


def scale_for(z):
    """Skala sigma supaya |z| <= Z*skala tepat (1-ALPHA) kejadian."""
    return np.quantile(np.abs(z), 1 - ALPHA) / Z


def run(panel, obs):
    dates = panel.index.unique().sort_values().intersection(obs.index)
    rows, ihsg = [], []
    ihsg_fwd_vol = obs["ret"].rolling(H).std().shift(-H)  # vol IHSG H hari ke depan
    for start in range(MIN_TRAIN_DAYS, len(dates) - H, TEST_DAYS):
        train_end = dates[start - H - 1]
        test_dates = dates[start:start + TEST_DAYS]
        R = regime_probs(obs, train_end, sort_col=1)  # P0 tenang .. P2 volatil

        tr = panel[(panel.index <= train_end) & panel["dev"]]
        tr_state = R.reindex(tr.index).values.argmax(1)
        k_global = scale_for(tr["z"])
        k_state = np.array([
            scale_for(tr["z"][tr_state == s]) if (tr_state == s).sum() >= MIN_STATE_ROWS else k_global
            for s in range(N_REGIMES)])

        te = panel[panel.index.isin(test_dates)].copy()
        p = R.reindex(te.index).values
        te["state"] = p.argmax(1)
        te["k_app"] = 1.0
        te["k_global"] = k_global
        te["k_regime"] = p @ k_state
        te["fold"] = str(test_dates[0].date())
        rows.append(te)

        r_test = R.reindex(test_dates)
        ihsg.append(pd.DataFrame({"state": r_test.values.argmax(1),
                                  "fwd_vol": ihsg_fwd_vol.reindex(test_dates).values}))
        print(f"fold {test_dates[0].date()}  skala global {k_global:.2f}  "
              f"per regime {np.round(k_state, 2)}")
    return pd.concat(rows), pd.concat(ihsg).dropna()


def score(df, model):
    half = Z * df[f"k_{model}"] * df["vol20"] * np.sqrt(H)
    miss = (df["fwd"].abs() - half).clip(lower=0)
    return pd.Series({
        "n": len(df),
        "coverage": (df["fwd"].abs() <= half).mean(),
        "lebar%": (2 * half).mean() * 100,
        "winkler": (2 * half + 2 / ALPHA * miss).mean() * 100,
    })


def report(res, ihsg):
    print("\n== 1. Apakah regime HMM memisahkan risiko? (out-of-sample)")
    sep = ihsg.groupby("state")["fwd_vol"].agg(["size", "mean"])
    sep["mean"] *= np.sqrt(250) * 100
    sep.index = [NAMES[s] for s in sep.index]
    sep.columns = ["hari", "vol IHSG 5h ke depan (% tahunan)"]
    print(sep.round(1).to_string())
    absz = res.groupby("state")["z"].apply(lambda z: z.abs().mean())
    print("rata2 |gerak saham| / vol20:", {NAMES[s]: round(v, 2) for s, v in absz.items()})

    for label, part in [("dev (proxy IDX100)", res[res["dev"]]), ("holdout (saham lain)", res[~res["dev"]])]:
        print(f"\n== 2. Kisaran 80% - {label}")
        table = pd.concat({m: score(part, m) for m in MODELS}, axis=1).T
        print(table.round(3).to_string())
        print("per regime (coverage | winkler):")
        per = {}
        for s in range(N_REGIMES):
            sub = part[part["state"] == s]
            if len(sub):
                per[NAMES[s]] = {m: f"{score(sub, m)['coverage']:.3f} | {score(sub, m)['winkler']:.2f}"
                                 for m in MODELS}
        print(pd.DataFrame(per).T.to_string())

    hold = res[~res["dev"]]
    s_reg, s_glob = score(hold, "regime"), score(hold, "global")
    worst = min(score(hold[hold["state"] == s], "regime")["coverage"]
                for s in range(N_REGIMES) if (hold["state"] == s).any())
    print("\n== Verdict (holdout)")
    print(f"winkler regime {s_reg['winkler']:.2f} vs global {s_glob['winkler']:.2f} "
          f"({(1 - s_reg['winkler'] / s_glob['winkler']) * 100:+.1f}% lebih baik)")
    print(f"coverage terburuk per regime: {worst:.3f} (lolos kalau >= 0.75)")
    switches = (ihsg["state"].diff() != 0).sum() / (len(ihsg) / 250)
    print(f"pindah regime ~{switches:.0f}x per tahun (UI enak kalau tidak terlalu sering)")


def main():
    panel, market = load()
    print(f"{panel['ticker'].nunique()} saham, {panel.index.nunique()} hari, "
          f"{panel['dev'].sum()} baris dev / {(~panel['dev']).sum()} holdout")
    res, ihsg = run(panel, market_obs(market))
    report(res, ihsg)


if __name__ == "__main__":
    main()
