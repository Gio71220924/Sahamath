"""Cek predict.ownership_shares pada baris Balancepos sintetis. Run: python tests/test_ownership.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from predict import ownership_shares  # noqa: E402

# Date|Code|Type|Sec. Num|Price|Local IS,CP,PF,IB,ID,MF,SC,FD,OT|Local Total|Foreign IS..OT|Foreign Total
local = [10, 20, 0, 0, 30, 5, 0, 0, 0]          # total 65
foreign = [0, 0, 0, 0, 0, 0, 0, 0, 35]          # total 35
row = "|".join(["30-SEP-2026", "TEST", "EQUITY", "100", "1000"] + [str(v) for v in local]
               + ["65"] + [str(v) for v in foreign] + ["35"])
lines = ["Date|Code|Type|...", "30-SEP-2026|LAIN|EQUITY|" + "|".join(["1"] * 22), row]

s = ownership_shares(lines, "TEST")
assert abs(s["asing"] - 35) < 1e-9 and abs(s["ritel"] - 30) < 1e-9, s
assert abs(s["asuransi"] - 10) < 1e-9 and abs(s["korporasi"] - 20) < 1e-9 and abs(s["reksadana"] - 5) < 1e-9, s
assert abs(s["lainnya"]) < 1e-9, s
assert ownership_shares(lines, "NONE") is None
print("ok")
