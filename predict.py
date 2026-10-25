import sys
import json
import os
import re
import time
import warnings
import zipfile
import pandas as pd
import numpy as np
import requests
import yfinance as yf

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

from ta.volatility import BollingerBands, AverageTrueRange
from ta.momentum import StochasticOscillator
from ta.volume import OnBalanceVolumeIndicator, ChaikinMoneyFlowIndicator, MFIIndicator
from ta.trend import ADXIndicator

FEE_BUFFER_PCT = 0.45

# ─── Indicator Calculations ───────────────────────────────────────────────────

def calculate_indicators(df):
    """Hitung semua indikator teknikal + fitur bandarmology dari OHLCV."""
    close  = df['Close'].squeeze()
    high   = df['High'].squeeze()
    low    = df['Low'].squeeze()
    volume = df['Volume'].squeeze()

    # Existing indicators
    bb = BollingerBands(close=close, window=20, window_dev=2)
    df['BB_MIDDLE'] = bb.bollinger_mavg()
    df['BB_UPPER']  = bb.bollinger_hband()
    df['BB_LOWER']  = bb.bollinger_lband()

    stoch = StochasticOscillator(high=high, low=low, close=close, window=14, smooth_window=3)
    df['STOCH_%K'] = stoch.stoch()
    df['STOCH_%D'] = stoch.stoch_signal()

    adx = ADXIndicator(high=high, low=low, close=close, window=14)
    df['ADX']     = adx.adx()
    df['ADX_POS'] = adx.adx_pos()
    df['ADX_NEG'] = adx.adx_neg()

    df['OBV'] = OnBalanceVolumeIndicator(close=close, volume=volume).on_balance_volume()

    atr = AverageTrueRange(high=high, low=low, close=close, window=14)
    df['ATR']     = atr.average_true_range()
    df['ATR_pct'] = df['ATR'] / df['Close']

    df['RET_3D'] = close.pct_change(3)
    df['MA20'] = close.rolling(20).mean()
    df['MA50'] = close.rolling(50).mean()
    df['MA20_SLOPE'] = df['MA20'].pct_change(5)
    df['MA20_DISTANCE'] = close / df['MA20'].replace(0, np.nan) - 1
    df['MA50_DISTANCE'] = close / df['MA50'].replace(0, np.nan) - 1
    df['TREND_SCORE'] = (
        (close > df['MA20']).astype(int)
        + (df['MA20'] > df['MA50']).astype(int)
        + (df['MA20_SLOPE'] > 0).astype(int)
    )
    df['SPREAD'] = high - low
    df['SPREAD_MA20'] = df['SPREAD'].rolling(20).mean()
    df['SPREAD_RATIO'] = df['SPREAD'] / df['SPREAD_MA20'].replace(0, np.nan)

    # New bandarmology features
    vol_mean = volume.rolling(20).mean()
    vol_std  = volume.rolling(20).std()

    df['vol_ratio']  = volume / vol_mean.replace(0, np.nan)
    df['vol_zscore'] = (volume - vol_mean) / vol_std.replace(0, np.nan)
    df['close_pos']  = (close - low) / (high - low + 1e-9)
    df['VALUE_MA20'] = (close * volume).rolling(20).mean()
    df['LIQUIDITY_SCORE'] = np.log1p(df['VALUE_MA20'].clip(lower=0))

    strong_volume = df['vol_ratio'] > 1.5
    high_volume = df['vol_ratio'] > 2.0
    quiet_volume = df['vol_ratio'] < 0.8
    wide_spread = df['SPREAD_RATIO'] > 1.4
    narrow_spread = df['SPREAD_RATIO'] < 0.8
    close_top = df['close_pos'] > 0.65
    close_bottom = df['close_pos'] < 0.35
    df['VSA_DEMAND'] = (strong_volume & close_top & (close.pct_change(1) > 0)).astype(int)
    df['VSA_SUPPLY_RISK'] = (high_volume & close_bottom & wide_spread).astype(int)
    df['VSA_ACCUMULATION'] = (high_volume & close_top & (close.pct_change(5) <= 0)).astype(int)
    df['VSA_NO_SUPPLY'] = (quiet_volume & narrow_spread & (df['close_pos'] > 0.45)).astype(int)
    df['VSA_SCORE'] = (
        (2 * df['VSA_DEMAND'])
        + df['VSA_ACCUMULATION']
        + df['VSA_NO_SUPPLY']
        - (2 * df['VSA_SUPPLY_RISK'])
    )

    df['CMF'] = ChaikinMoneyFlowIndicator(
        high=high, low=low, close=close, volume=volume, window=20
    ).chaikin_money_flow()

    df['MFI'] = MFIIndicator(
        high=high, low=low, close=close, volume=volume, window=14
    ).money_flow_index()

    return df


def fetch_market_history():
    """Ambil IHSG untuk fitur market regime. Gagal fetch = fitur netral."""
    try:
        market = yf.download(
            "^JKSE", period="140d", interval="1d",
            progress=False, auto_adjust=False
        )
        if market.empty:
            return None
        if isinstance(market.columns, pd.MultiIndex):
            market.columns = market.columns.get_level_values(0)
        market["Close"] = pd.to_numeric(market["Close"], errors="coerce")
        market.ffill(inplace=True)
        market.bfill(inplace=True)
        return market
    except Exception:
        return None


def add_market_features(df, market=None):
    """Tambahkan fitur rezim IHSG dan relative strength saham vs IHSG."""
    df["RET_1D"] = df["Close"].pct_change(1)
    df["RET_5D"] = df["Close"].pct_change(5)
    df["RET_20D"] = df["Close"].pct_change(20)

    if market is None or market.empty:
        df["IHSG_RET_5D"] = 0.0
        df["IHSG_RET_20D"] = 0.0
        df["REL_STRENGTH_20D"] = df["RET_20D"].fillna(0)
        df["MARKET_ABOVE_MA20"] = 1
        df["MARKET_REGIME_SCORE"] = 0
        return df

    market = market.copy()
    market.index = pd.to_datetime(market.index).normalize()
    lookup_index = pd.to_datetime(df.index).normalize()
    aligned = market.reindex(lookup_index, method="ffill").bfill()
    aligned.index = df.index
    if "Close" not in aligned or aligned["Close"].isna().all():
        df["IHSG_RET_5D"] = 0.0
        df["IHSG_RET_20D"] = 0.0
        df["REL_STRENGTH_20D"] = df["RET_20D"].fillna(0)
        df["MARKET_ABOVE_MA20"] = 1
        df["MARKET_REGIME_SCORE"] = 0
        return df
    mclose = aligned["Close"].replace(0, np.nan)
    ma20 = mclose.rolling(20).mean()

    df["IHSG_RET_5D"] = mclose.pct_change(5)
    df["IHSG_RET_20D"] = mclose.pct_change(20)
    df["REL_STRENGTH_20D"] = df["RET_20D"] - df["IHSG_RET_20D"]
    df["MARKET_ABOVE_MA20"] = (mclose > ma20).astype(int)
    df["MARKET_REGIME_SCORE"] = np.select(
        [
            (df["IHSG_RET_20D"] > 0.03) & (df["MARKET_ABOVE_MA20"] == 1),
            (df["IHSG_RET_20D"] < -0.03) & (df["MARKET_ABOVE_MA20"] == 0),
        ],
        [1, -1],
        default=0,
    )
    return df


def safe_float(val, digits=4):
    try:
        f = float(val)
        return round(f, digits) if not np.isnan(f) else None
    except Exception:
        return None


RANGE_Z = 1.2816  # z-score P90 distribusi normal; P10 = -RANGE_Z
# HAR (varian har_mix) dari train_vol.py: intercept, log RV 1 hari, 5 hari, 22 hari.
# Re-fit tiap ~tahun: python train_vol.py
HAR_BETA = (-1.367, 0.2171, 0.2522, 0.3481)
HAR_SCALE = 1.0314  # kalibrasi supaya P10-P90 kena 80%


def har_sigma(ohlcv):
    """Sigma harian HAR (Corsi 2009), RV harian = rata-rata Garman-Klass(+gap) dan return close².
    Walk-forward 15 kuartal (train_vol.py), saham holdout: Winkler +4.4% vs vol close-to-close,
    +3.6% setelah gerak besar, menang 15/15 fold. GK saja meremehkan hari tren (ARA/ARB)."""
    df = ohlcv[ohlcv["Volume"] > 0]  # hari tanpa transaksi (O=H=L=C hasil ffill) bukan volatilitas
    if len(df) < 23:
        return np.nan
    o, h, l, c = (np.log(df[k]) for k in ["Open", "High", "Low", "Close"])
    gk = (o - c.shift(1)) ** 2 + 0.5 * (h - l) ** 2 - (2 * np.log(2) - 1) * (c - o) ** 2
    rv = (0.5 * (gk + c.diff() ** 2)).clip(lower=1e-8)
    x = np.log([rv.iloc[-1], rv.tail(5).mean(), rv.tail(22).mean()])
    return HAR_SCALE * np.sqrt(np.exp(HAR_BETA[0] + np.dot(HAR_BETA[1:], x)))


def price_range(ohlcv, horizon):
    """Kisaran harga P10-P90 `horizon` hari: lognormal tanpa drift (= Monte Carlo GBM tanpa simulasi),
    sigma dari HAR. Fallback ke vol close-to-close 20 hari kalau data OHLC kurang."""
    vol = har_sigma(ohlcv)
    if not np.isfinite(vol) or vol <= 0:
        vol = np.log(ohlcv["Close"]).diff().tail(20).std()
    if not np.isfinite(vol) or vol <= 0:
        return None
    spread = RANGE_Z * vol * np.sqrt(horizon)
    last = float(ohlcv["Close"].iloc[-1])
    return {
        "horizon": horizon,
        "confidence": 0.8,
        "p10": round(last * np.exp(-spread)),
        "p50": round(last),
        "p90": round(last * np.exp(spread)),
        "p10_pct": round((np.exp(-spread) - 1) * 100, 1),
        "p90_pct": round((np.exp(spread) - 1) * 100, 1),
    }


def build_market_context(last):
    regime_score = int(safe_float(last.get("MARKET_REGIME_SCORE"), 0) or 0)
    regime = "bullish" if regime_score > 0 else "bearish" if regime_score < 0 else "sideways"
    return {
        "regime": regime,
        "ihsg_ret_5d": safe_float(last.get("IHSG_RET_5D")),
        "ihsg_ret_20d": safe_float(last.get("IHSG_RET_20D")),
        "relative_strength_20d": safe_float(last.get("REL_STRENGTH_20D")),
    }


def build_trading_plan(last_price, atr_val):
    """Level risiko berbasis ATR (TP 2x, SL 1.5x) — bukan sinyal arah."""
    return {
        "entry": round(last_price, 0),
        "target_profit": round(last_price + atr_val * 2, 0),
        "stop_loss": round(last_price - atr_val * 1.5, 0),
        "tp_percent": round(atr_val * 2 / last_price * 100, 2),
        "sl_percent": round(-atr_val * 1.5 / last_price * 100, 2),
        # Base rate dari train_tp.py (±294rb plan IDX 2022-2026, 10 hari bursa, walk-forward)
        "base_rates": {"tp_first": 28, "sl_first": 37, "neither": 34, "sample": 294000, "days": 10},
        "note": ("TP 2× ATR, SL 1.5× ATR (RR 1.33). Historis IDX, 10 hari: kena TP duluan ~28%, "
                 "SL duluan ~37%, belum kena ~34%. Level risiko, bukan sinyal beli."),
    }


# ─── Seberapa liar saham ini ──────────────────────────────────────────────────

# Persentil volatilitas harian 60 hari (%/hari) saham likuid IDX (>= Rp5 M/hari, harga >= 100),
# P10..P90, median 12 bulan s/d Sep 2026. Refresh berkala dari data train_anomalies.panels().
VOL60_PCTL = (1.86, 2.33, 2.82, 3.39, 4.10, 4.78, 5.88, 6.67, 7.99)


def volatility_profile(ohlcv):
    """Volatilitas 60 hari + posisinya di antara saham likuid IDX. Riset train_anomalies.py:
    20% saham paling liar (>= P80) rata-rata tertinggal 1,76%/bulan dari pasar (t -2,3, 2021-2026)."""
    df = ohlcv[ohlcv["Volume"] > 0]
    r = df["Close"].pct_change().tail(60)
    r = r[r.abs() < 0.5]  # >50% sehari = data rusak / aksi korporasi
    if len(r) < 45:
        return None
    vol = float(r.std() * 100)
    pct = float(np.interp(vol, VOL60_PCTL, np.arange(10, 100, 10), left=5, right=95))
    return {"vol60": round(vol, 2), "percentile": int(round(pct)), "top_quintile": vol >= VOL60_PCTL[7]}


# ─── Kepemilikan KSEI ─────────────────────────────────────────────────────────

KSEI = "https://web.ksei.co.id"
KSEI_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "ksei")
KSEI_UA = {"User-Agent": "Mozilla/5.0"}
# Balancepos: Date|Code|Type|Sec. Num|Price|Local IS..OT (5-13)|Local Total (14)|Foreign IS..OT (15-23)|Foreign Total (24)
OWN_GROUPS = [("asing", "Investor asing", [24]), ("ritel", "Ritel lokal", [9]), ("asuransi", "Asuransi", [5]),
              ("reksadana", "Reksa dana", [10]), ("korporasi", "Korporasi", [6])]


def ksei_files(n=2):
    """Path n file KSEI bulanan terbaru (cache di disk). Daftar arsip di-refresh tiap 24 jam."""
    os.makedirs(KSEI_CACHE, exist_ok=True)
    index = os.path.join(KSEI_CACHE, "index.txt")
    if os.path.exists(index) and time.time() - os.path.getmtime(index) < 86400:
        with open(index) as f:
            names = f.read().split()
    else:
        page = requests.get(f"{KSEI}/archive_download/holding_composition", headers=KSEI_UA, timeout=10).text
        names = sorted(set(re.findall(r"BalanceposEfek\d{8}\.zip", page)))
        with open(index, "w") as f:
            f.write("\n".join(names))
    paths = []
    for name in names[-n:]:
        path = os.path.join(KSEI_CACHE, name)
        if not os.path.exists(path):
            r = requests.get(f"{KSEI}/Download/{name}", headers=KSEI_UA, timeout=20)
            if not (r.ok and r.content[:2] == b"PK"):
                continue
            with open(path, "wb") as f:
                f.write(r.content)
        paths.append(path)
    return paths


def ownership_shares(lines, ticker):
    """Porsi (%) per kelompok pemegang dari baris Balancepos; None kalau ticker tidak ada."""
    for line in lines:
        p = line.split("|")
        if len(p) >= 25 and p[1].strip() == ticker and p[2].strip() == "EQUITY":
            held = float(p[14]) + float(p[24])
            if held <= 0:
                return None
            shares = {key: sum(float(p[i]) for i in cols) / held * 100 for key, _, cols in OWN_GROUPS}
            shares["lainnya"] = 100 - sum(shares.values())
            return shares
    return None


def fetch_ownership(ticker):
    """Komposisi kepemilikan KSEI bulan terakhir + perubahan dari bulan sebelumnya. None kalau gagal."""
    ticker = ticker.upper().replace(".JK", "")
    try:
        months = []
        for path in ksei_files(2):
            with zipfile.ZipFile(path) as z:
                lines = z.read(z.namelist()[0]).decode("utf-8", "replace").splitlines()
            shares = ownership_shares(lines, ticker)
            if shares:
                stamp = os.path.basename(path)[14:22]  # BalanceposEfekYYYYMMDD.zip
                months.append((f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}", shares))
        if not months:
            return None
        date, cur = months[-1]
        prev = months[-2] if len(months) > 1 else None
        labels = {key: label for key, label, _ in OWN_GROUPS}
        labels["lainnya"] = "Lainnya"
        return {
            "date": date,
            "prev_date": prev[0] if prev else None,
            "groups": [{"key": k, "label": labels[k], "pct": round(v, 2),
                        "delta": round(v - prev[1][k], 2) if prev else None} for k, v in cur.items()],
        }
    except Exception:
        return None


# ─── Main Prediction ──────────────────────────────────────────────────────────

def get_prediction(ticker):
    try:
        # 1. Download OHLCV
        fmt_ticker = f"{ticker}.JK" if not ticker.upper().endswith('.JK') else ticker
        df = yf.download(
            fmt_ticker, period="100d", interval="1d",
            progress=False, auto_adjust=True  # split/div-adjusted so a stock split isn't read as a -95% crash
        )

        if df.empty:
            return {"status": "error", "message": f"Kode {ticker} tidak ditemukan di BEI. Periksa lagi kodenya."}
        if len(df) < 30:
            return {"status": "error", "message": f"Data {ticker} baru {len(df)} hari bursa, butuh minimal 30 hari (saham baru tercatat?)."}

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df.ffill(inplace=True)
        df.bfill(inplace=True)

        # OHLCV mentah untuk kisaran harga: HAR butuh 22+ hari, dropna indikator (MA50) memotong data
        ohlcv = df[['Open', 'High', 'Low', 'Close', 'Volume']].copy()

        # 2. Hitung indikator + market regime
        df = calculate_indicators(df)
        df = add_market_features(df, fetch_market_history())
        df.dropna(inplace=True)

        if len(df) < 10:
            return {"status": "error", "message": f"Data {ticker} tidak cukup setelah kalkulasi indikator."}

        # 3. Indikator terakhir + flow
        history_df = df.tail(60)
        last_price = float(df['Close'].iloc[-1])
        atr_val    = float(df['ATR'].iloc[-1])
        last = df.iloc[-1]
        bb_pos = (
            "Overbought" if float(last['Close']) > float(last['BB_UPPER'])
            else "Oversold" if float(last['Close']) < float(last['BB_LOWER'])
            else "Normal"
        )
        indicators = {
            "stoch":     safe_float(last.get('STOCH_%K')),
            "bb_pos":    bb_pos,
            "adx":       safe_float(last.get('ADX')),
            "obv":       safe_float(last.get('OBV')),
            "cmf":       safe_float(last.get('CMF')),
            "mfi":       safe_float(last.get('MFI')),
            "vol_ratio": safe_float(last.get('vol_ratio')),
            "close_pos": safe_float(last.get('close_pos')),
        }
        market_context = build_market_context(last)
        plan = build_trading_plan(last_price, atr_val)

        # 4. Chart history
        chart_data = [
            {
                "time":   idx.strftime('%Y-%m-%d'),
                "open":   float(row['Open']),
                "high":   float(row['High']),
                "low":    float(row['Low']),
                "close":  float(row['Close']),
            }
            for idx, row in history_df.iterrows()
        ]

        # 5. Susun response
        return {
            "status":      "success",
            "ticker":      ticker.upper(),
            "market":      market_context,
            "trading_plan": plan,
            "price_range": price_range(ohlcv, 5),
            "ownership":   fetch_ownership(ticker),
            "volatility":  volatility_profile(ohlcv),
            "indicators":  indicators,
            "chart_history": chart_data,
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    ticker_input = sys.argv[1] if len(sys.argv) > 1 else "BBCA"
    print(json.dumps(get_prediction(ticker_input)))
