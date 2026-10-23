"""Cek predict.price_range / har_sigma. Run: python tests/test_price_range.py"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from predict import har_sigma, price_range  # noqa: E402


def ohlcv(n, seed=0):
    rng = np.random.default_rng(seed)
    close = 1000 * np.exp(np.cumsum(rng.normal(0, 0.02, n)))
    open_ = close * np.exp(rng.normal(0, 0.005, n))
    high = np.maximum(open_, close) * np.exp(np.abs(rng.normal(0, 0.01, n)))
    low = np.minimum(open_, close) * np.exp(-np.abs(rng.normal(0, 0.01, n)))
    idx = pd.bdate_range("2026-01-01", periods=n)
    return pd.DataFrame({"Open": open_, "High": high, "Low": low, "Close": close, "Volume": 1e6}, index=idx)


df = ohlcv(70)
sigma = har_sigma(df)
assert 0.005 < sigma < 0.05, sigma

# hari tanpa transaksi (yfinance + ffill: O=H=L=C=close kemarin, Volume 0) tidak boleh menyempitkan kisaran
flat = pd.DataFrame([df.iloc[-1][["Close"]].repeat(4).values.tolist() + [0.0]] * 3,
                    columns=df.columns, index=pd.bdate_range(df.index[-1], periods=4)[1:])
assert np.isclose(har_sigma(pd.concat([df, flat])), sigma)

# data pendek → HAR NaN, price_range fallback ke vol close-to-close
short = df.tail(15)
assert np.isnan(har_sigma(short))
r = price_range(short, 5)
assert r and r["p10"] < r["p50"] < r["p90"], r

r = price_range(df, 5)
assert r["p10"] < r["p50"] < r["p90"] and r["p10_pct"] < 0 < r["p90_pct"], r
print("ok")
