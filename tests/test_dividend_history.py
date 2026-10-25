"""Cek dividend_history.events tanpa jaringan. Run: python tests/test_dividend_history.py"""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dividend_history import events  # noqa: E402

idx = pd.date_range("2026-03-02", periods=8, freq="B", tz="Asia/Jakarta")
ohlcv = pd.DataFrame({
    "Close":  [1000, 1010, 1010, 950, 960, 500, 505, 510],
    "Volume": [1e6, 1e6, 0, 1e6, 1e6, 1e6, 1e6, 1e6],  # hari ke-3 tanpa transaksi
}, index=idx)
div = pd.Series({
    idx[0]: 5.0,    # hari pertama: tidak ada cum date → dibuang
    idx[3]: 60.0,   # cum = hari ke-2 (hari ke-3 volume 0 dilewati): 1010 → 950
    idx[5]: 10.0,   # 960 → 500 = lompatan split → dibuang
})

ev = events(ohlcv, div)
assert ev == [{"ex": "2026-03-05", "cum_close": 1010.0, "ex_close": 950.0, "amount": 60.0}], ev
print("ok")
