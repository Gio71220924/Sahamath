"""Eksperimen: peluang Trading Plan app kena TP duluan vs SL duluan, walk-forward.

Plan = sama dengan predict.build_trading_plan: entry close, TP +2xATR14, SL -1.5xATR14.
Dipantau N hari bursa pakai High/Low harian. Hari yang nyentuh TP dan SL sekaligus
dihitung SL (konservatif). Tidak kena dua-duanya = timeout.

Model (prob 3 kelas: TP / SL / timeout):
- const : frekuensi kelas di data train (baseline jujur).
- vol   : logistic regression, fitur volatilitas saja (jarak TP/SL dalam satuan sigma).
- full  : vol + momentum/tren + IHSG. Kalau ini jauh > vol, berarti ada info arah.

Universe & waktu sama dengan train_regime.py: fit di proxy IDX100 (top-100 likuiditas per tanggal),
uji juga di holdout saham lain yang tidak pernah dipakai fit. Purge N+1 hari.
Metrik: Brier skill vs const (> 0 = lebih baik), kalibrasi P(TP) per desil.
Belum export model. Run: python train_tp.py
"""
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange

from train import MIN_TRAIN_DAYS, PERIOD, TEST_DAYS, download_ohlcv

N = 10
TP_ATR, SL_ATR = 2.0, 1.5
TOP_N = 100
MIN_VALUE = 1e9
MIN_PRICE = 50
CLASSES = ["TP", "SL", "timeout"]
VOL_FEATURES = ["log_atr", "log_vol20", "tp_sigma"]
FULL_FEATURES = VOL_FEATURES + ["ret20", "ma20_dist", "rsi", "ihsg_ret20", "ihsg_vol20"]


def outcome(df, atr):
    """0 = TP duluan, 1 = SL duluan (termasuk hari yang sama), 2 = timeout, NaN = data kurang."""
    tp, sl = df["Close"] + TP_ATR * atr, df["Close"] - SL_ATR * atr
    tp_day = pd.Series(np.inf, index=df.index)
    sl_day = pd.Series(np.inf, index=df.index)
    for k in range(N, 0, -1):  # mundur → nilai akhir = hari pertama yang kena
        tp_day[df["High"].shift(-k) >= tp] = k
        sl_day[df["Low"].shift(-k) <= sl] = k
    neither = (tp_day == np.inf) & (sl_day == np.inf)
    out = np.select([neither, sl_day <= tp_day], [2, 1], 0).astype(float)
    out[df["Close"].shift(-N).isna().values] = np.nan
    return out


def load():
    raw = download_ohlcv()
    market = yf.download("^JKSE", period=PERIOD, interval="1d", progress=False, auto_adjust=False)
    if isinstance(market.columns, pd.MultiIndex):
        market.columns = market.columns.get_level_values(0)
    m = np.log(market["Close"]).diff()
    ihsg = pd.DataFrame({"ihsg_ret20": m.rolling(20).sum(), "ihsg_vol20": m.rolling(20).std()})
    ihsg.index = pd.to_datetime(ihsg.index).normalize()

    frames = []
    for jk in raw.columns.get_level_values(0).unique():
        df = raw[jk][["High", "Low", "Close", "Volume"]].apply(pd.to_numeric, errors="coerce").dropna()
        df = df[(df["Volume"] > 0) & (df["Close"] > 0)]
        if len(df) < MIN_TRAIN_DAYS:
            continue
        df.index = pd.to_datetime(df.index).normalize()
        atr = AverageTrueRange(df["High"], df["Low"], df["Close"], window=14).average_true_range()
        logret = np.log(df["Close"]).diff()
        vol20 = logret.rolling(20).std()
        atr_pct = atr / df["Close"]
        frames.append(pd.DataFrame({
            "ticker": jk.removesuffix(".JK"),
            "close": df["Close"],
            "value": (df["Close"] * df["Volume"]).rolling(20).mean(),
            "log_atr": np.log(atr_pct),
            "log_vol20": np.log(vol20),
            "tp_sigma": TP_ATR * atr_pct / (vol20 * np.sqrt(N)),  # jarak TP dalam sigma N hari
            "ret20": logret.rolling(20).sum(),
            "ma20_dist": df["Close"] / df["Close"].rolling(20).mean() - 1,
            "rsi": RSIIndicator(df["Close"], window=14).rsi(),
            "y": outcome(df, atr),
        }, index=df.index).join(ihsg))

    panel = pd.concat(frames).replace([np.inf, -np.inf], np.nan).dropna()
    panel.index.name = "date"
    panel = panel[(panel["value"] >= MIN_VALUE) & (panel["close"] >= MIN_PRICE)]
    panel["dev"] = panel.groupby(level="date")["value"].rank(ascending=False) <= TOP_N
    panel["y"] = panel["y"].astype(int)
    return panel


def run(panel):
    dates = panel.index.unique().sort_values()
    out = []
    for start in range(MIN_TRAIN_DAYS, len(dates) - N, TEST_DAYS):
        train_end = dates[start - N - 1]
        tr = panel[(panel.index <= train_end) & panel["dev"]]
        te = panel[panel.index.isin(dates[start:start + TEST_DAYS])].copy()
        freq = np.bincount(tr["y"], minlength=3) / len(tr)
        te[[f"const_{c}" for c in CLASSES]] = freq
        for name, feats in [("vol", VOL_FEATURES), ("full", FULL_FEATURES)]:
            model = make_pipeline(StandardScaler(), LogisticRegression(max_iter=500))
            model.fit(tr[feats], tr["y"])
            te[[f"{name}_{c}" for c in CLASSES]] = model.predict_proba(te[feats])
        out.append(te)
        print(f"fold {dates[start].date()}  train TP/SL/timeout {np.round(freq, 3)}")
    return pd.concat(out)


def brier(df, model):
    onehot = np.eye(3)[df["y"].values]
    return ((df[[f"{model}_{c}" for c in CLASSES]].values - onehot) ** 2).sum(1).mean()


def report(res):
    for label, part in [("dev (proxy IDX100)", res[res["dev"]]), ("holdout (saham lain)", res[~res["dev"]])]:
        print(f"\n== {label}: {len(part)} plan")
        print("kejadian nyata:", {c: round((part['y'] == i).mean(), 3) for i, c in enumerate(CLASSES)})
        base = brier(part, "const")
        for m in ["const", "vol", "full"]:
            print(f"  {m:5s} brier {brier(part, m):.4f}  skill vs const {1 - brier(part, m) / base:+.2%}")

        print("  kalibrasi P(TP) model vol (desil prediksi -> kejadian nyata):")
        dec = pd.qcut(part["vol_TP"], 10, duplicates="drop")
        cal = part.groupby(dec, observed=True).agg(pred=("vol_TP", "mean"), nyata=("y", lambda y: (y == 0).mean()),
                                                   n=("y", "size"))
        print(cal.round(3).to_string(index=False))

    hold = res[~res["dev"]]
    print("\n== Sebaran P(TP) per plan (holdout, model vol)")
    print(hold["vol_TP"].describe(percentiles=[0.1, 0.5, 0.9]).round(3).to_string())


def main():
    panel = load()
    print(f"{panel['ticker'].nunique()} saham, {panel.index.nunique()} hari, "
          f"{panel['dev'].sum()} dev / {(~panel['dev']).sum()} holdout")
    report(run(panel))


if __name__ == "__main__":
    main()
