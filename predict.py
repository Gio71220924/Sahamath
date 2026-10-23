import sys
import json
import warnings
import joblib
import pandas as pd
import numpy as np
import requests
import yfinance as yf
from datetime import datetime, timedelta

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

from ta.volatility import BollingerBands, AverageTrueRange
from ta.momentum import StochasticOscillator
from ta.volume import OnBalanceVolumeIndicator, ChaikinMoneyFlowIndicator, MFIIndicator
from ta.trend import ADXIndicator

FEE_BUFFER_PCT = 0.45
MIN_EDGE_ATR_MULT = 0.5

# ─── Model Loader ─────────────────────────────────────────────────────────────

def load_models():
    """Load best_models.pkl (multi-model). Fallback ke trading_model.pkl lama."""
    try:
        bundle = joblib.load('best_models.pkl')
        if isinstance(bundle, dict) and 'universal' in bundle:
            return bundle, 'multi'
        raise ValueError("Format best_models.pkl tidak valid")
    except Exception:
        pass

    try:
        old = joblib.load('trading_model.pkl')
        return {'universal': {'model': old['model'], 'features': old['features'], 'horizon': 5}}, 'legacy'
    except Exception:
        return None, None


def select_model(models, ticker):
    """Pilih universal sebagai default, per-emiten hanya fallback legacy."""
    meta = models.get('_meta') if isinstance(models.get('_meta'), dict) else {}
    default_model = meta.get('default_model', 'universal')
    if default_model == 'universal' and 'universal' in models:
        return models['universal'], 'universal'
    if ticker.upper() in models:
        return models[ticker.upper()], 'per_emiten'
    if 'universal' in models:
        return models['universal'], 'universal'
    return None, None


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


def price_range(close, horizon):
    """Kisaran harga P10-P90 `horizon` hari: lognormal dari volatilitas 20 hari (= Monte Carlo GBM
    tanpa simulasi). Walk-forward di 560 saham IDX (train_range.py): coverage 80.4%,
    lebih terkalibrasi dari LightGBM quantile (69.9%) dan kuantil historis (74.2%)."""
    vol = np.log(close).diff().tail(20).std()
    if not np.isfinite(vol) or vol <= 0:
        return None
    spread = RANGE_Z * vol * np.sqrt(horizon)
    last = float(close.iloc[-1])
    return {
        "horizon": horizon,
        "confidence": 0.8,
        "p10": round(last * np.exp(-spread)),
        "p50": round(last),
        "p90": round(last * np.exp(spread)),
        "p10_pct": round((np.exp(-spread) - 1) * 100, 1),
        "p90_pct": round((np.exp(spread) - 1) * 100, 1),
    }


def prediction_label(pred):
    return "UP" if int(pred) == 1 else "DOWN" if int(pred) == -1 else "NEUTRAL"


def clamp(value, low, high):
    return max(low, min(high, value))


def evaluate_recent_signals(history_df, horizon):
    """Backtest ringan berbasis forward return setelah fee/slippage buffer."""
    wins = 0
    total = 0
    buy_wins = buy_total = 0
    sell_wins = sell_total = 0
    returns = []
    actionable_trades = 0
    equity = 1.0
    peak = 1.0
    max_drawdown = 0.0
    trade_details = []

    for i in range(len(history_df) - horizon):
        sig = int(history_df["pred"].iloc[i])
        if sig == 0:
            continue

        current_price = float(history_df["Close"].iloc[i])
        future_price = float(history_df["Close"].iloc[i + horizon])
        atr_val = float(history_df["ATR"].iloc[i]) if "ATR" in history_df else 0.0
        min_edge_pct = max(
            FEE_BUFFER_PCT,
            (atr_val / current_price * 100 * MIN_EDGE_ATR_MULT) if current_price > 0 else FEE_BUFFER_PCT,
        )

        gross_pct = (
            (future_price - current_price) / current_price * 100
            if sig == 1
            else (current_price - future_price) / current_price * 100
        )
        net_pct = gross_pct - FEE_BUFFER_PCT
        is_win = net_pct > 0
        qualified = net_pct >= min_edge_pct

        total += 1
        wins += 1 if is_win else 0
        if sig == 1:
            buy_total += 1
            buy_wins += 1 if is_win else 0
        else:
            sell_total += 1
            sell_wins += 1 if is_win else 0

        if sig == 1:
            actionable_trades += 1
            returns.append(net_pct)
            trade_return = max(net_pct / 100, -0.99)
            equity *= (1 + trade_return)
            peak = max(peak, equity)
            drawdown_pct = (equity / peak - 1) * 100 if peak > 0 else 0
            max_drawdown = min(max_drawdown, drawdown_pct)

        trade_details.append({
            "date": history_df.index[i].strftime("%d %b"),
            "signal": "BUY" if sig == 1 else "SELL",
            "price": current_price,
            "result": "WIN" if is_win else "LOSS",
            "qualified": qualified,
            "profit_pct": round(net_pct, 2),
            "gross_pct": round(gross_pct, 2),
            "min_edge_pct": round(min_edge_pct, 2),
        })

    gains = sum(r for r in returns if r > 0)
    losses = abs(sum(r for r in returns if r < 0))
    profit_factor = round(gains / losses, 2) if losses > 0 else (round(gains, 2) if gains > 0 else 0)

    return {
        "win_rate": round(wins / total * 100, 1) if total else 0,
        "signal_count": total,
        "actionable_trades": actionable_trades,
        "avg_return_pct": round(float(np.mean(returns)), 2) if returns else 0,
        "profit_factor": profit_factor,
        "max_drawdown_pct": round(max_drawdown, 2),
        "buy_win_rate": round(buy_wins / buy_total * 100, 1) if buy_total else None,
        "sell_win_rate": round(sell_wins / sell_total * 100, 1) if sell_total else None,
        "recent_trades": list(reversed(trade_details[-5:])),
    }


def get_strength(model, x_last):
    """Confidence lebih stabil: probability jika ada, fallback sigmoid margin."""
    try:
        proba = model.predict_proba(x_last)[0]
        return clamp(float(max(proba)), 0.0, 0.99), "probability"
    except Exception:
        pass

    try:
        scores = model.decision_function(x_last)[0]
        margin = float(max(abs(s) for s in scores)) if hasattr(scores, "__len__") else float(abs(scores))
        confidence = 0.5 + 0.5 * (margin / (1 + abs(margin)))
        return clamp(confidence, 0.0, 0.95), "margin"
    except Exception:
        return 0.0, "unknown"


def build_market_context(last):
    regime_score = int(safe_float(last.get("MARKET_REGIME_SCORE"), 0) or 0)
    regime = "bullish" if regime_score > 0 else "bearish" if regime_score < 0 else "sideways"
    return {
        "regime": regime,
        "ihsg_ret_5d": safe_float(last.get("IHSG_RET_5D")),
        "ihsg_ret_20d": safe_float(last.get("IHSG_RET_20D")),
        "relative_strength_20d": safe_float(last.get("REL_STRENGTH_20D")),
    }


def apply_signal_filters(raw_prediction, strength, band, market_context, indicators):
    """Post-filter: tahan sinyal lemah jika melawan flow, trend, atau market regime."""
    score = 0
    notes = []

    if raw_prediction == "UP":
        if market_context["regime"] == "bullish":
            score += 1
            notes.append("IHSG mendukung BUY")
        elif market_context["regime"] == "bearish":
            score -= 1
            notes.append("BUY melawan IHSG bearish")

        rs = market_context.get("relative_strength_20d")
        if rs is not None and rs > 0:
            score += 1
            notes.append("relative strength positif")
        elif rs is not None and rs < -0.03:
            score -= 1
            notes.append("relative strength lemah")

    elif raw_prediction == "DOWN":
        if market_context["regime"] == "bearish":
            score += 1
            notes.append("IHSG mendukung SELL")
        elif market_context["regime"] == "bullish":
            score -= 1
            notes.append("SELL melawan IHSG bullish")

    if band:
        inst_flow = float(band.get("net_foreign") or 0) + float(band.get("net_local") or 0)
        retail_flow = float(band.get("net_retail") or 0)
        if raw_prediction == "UP":
            if inst_flow > 0:
                score += 1
                notes.append("institusi akumulasi")
            if inst_flow < 0:
                score -= 1
                notes.append("institusi distribusi")
            if retail_flow > 0 and inst_flow < 0:
                score -= 1
                notes.append("retail dominan saat institusi jual")
        elif raw_prediction == "DOWN":
            if inst_flow < 0:
                score += 1
                notes.append("distribusi institusi")
            if inst_flow > 0:
                score -= 1
                notes.append("institusi masih akumulasi")

    adx = indicators.get("adx")
    if raw_prediction != "NEUTRAL" and adx is not None and adx < 15:
        score -= 1
        notes.append("ADX rendah: trend lemah")

    final_prediction = raw_prediction
    adjusted_strength = strength
    if raw_prediction != "NEUTRAL":
        adjusted_strength = clamp(strength + score * 0.04, 0.05, 0.95)
        if score <= -2 and strength < 0.72:
            final_prediction = "NEUTRAL"
            notes.append("sinyal ditahan oleh filter kualitas")

    if final_prediction == "NEUTRAL":
        quality = "WAIT"
    elif score >= 2 and adjusted_strength >= 0.65:
        quality = "HIGH"
    elif score >= 0:
        quality = "MEDIUM"
    else:
        quality = "LOW"

    return {
        "prediction": final_prediction,
        "strength": round(adjusted_strength, 2),
        "signal_quality": quality,
        "filter_score": score,
        "filters": notes,
    }


def build_trading_plan(prediction, last_price, atr_val):
    if prediction == "UP":
        return {
            "entry": round(last_price, 0),
            "target_profit": round(last_price + atr_val * 2, 0),
            "stop_loss": round(last_price - atr_val * 1.5, 0),
            "tp_percent": round(atr_val * 2 / last_price * 100, 2),
            "sl_percent": round(-atr_val * 1.5 / last_price * 100, 2),
            "note": "Kondisi Bullish. Potensi kenaikan terdeteksi.",
        }
    if prediction == "DOWN":
        return {
            "entry": round(last_price, 0),
            "target_profit": round(last_price - atr_val * 2, 0),
            "stop_loss": round(last_price + atr_val * 1.5, 0),
            "tp_percent": round(-atr_val * 2 / last_price * 100, 2),
            "sl_percent": round(atr_val * 1.5 / last_price * 100, 2),
            "note": "Kondisi Bearish. Hindari spekulasi beli.",
        }
    return {
        "entry": round(last_price, 0),
        "target_profit": 0,
        "stop_loss": 0,
        "tp_percent": 0,
        "sl_percent": 0,
        "note": "Sideways atau sinyal belum lolos filter kualitas.",
    }


# ─── Bandarmology Fetch ───────────────────────────────────────────────────────

def fetch_bandarmology(ticker):
    """Ambil net foreign flow + top broker dari api-saham. Return None jika gagal."""
    try:
        today     = datetime.now().strftime('%Y-%m-%d')
        from_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        url = (
            f"https://api-saham.mkemalw.workers.dev/cache-summary"
            f"?symbol={ticker}&from={from_date}&to={today}"
            f"&include_orderflow=false&cache=off"
        )
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()

        summary     = data.get('summary', {})
        net_foreign = float(summary.get('foreign', {}).get('net_val', 0) or 0)
        net_local   = float(summary.get('local',   {}).get('net_val', 0) or 0)
        net_retail  = float(summary.get('retail',  {}).get('net_val', 0) or 0)
        last_price  = None
        for entry in data.get('history', []):
            if entry.get('data', {}).get('price'):
                last_price = entry['data']['price']

        def map_buyer(b):
            bval = float(b.get('bval') or 0)
            sval = float(b.get('sval') or 0)
            bvol = float(b.get('bvol') or 0)
            return {
                'code':     b.get('code', ''),
                'type':     b.get('type', ''),
                'netVal':   round(bval - sval, 0),
                'avgPrice': round(bval / bvol) if bvol > 0 else 0,
            }

        def map_seller(b):
            bval = float(b.get('bval') or 0)
            sval = float(b.get('sval') or 0)
            svol = float(b.get('svol') or 0)
            return {
                'code':     b.get('code', ''),
                'type':     b.get('type', ''),
                'netVal':   round(sval - bval, 0),
                'avgPrice': round(sval / svol) if svol > 0 else 0,
            }

        buyers  = [map_buyer(b)  for b in data.get('summary', {}).get('top_net_buyers',  [])[:5]]
        sellers = [map_seller(b) for b in data.get('summary', {}).get('top_net_sellers', [])[:5]]

        return {
            'net_foreign': round(net_foreign, 0),
            'net_local':   round(net_local,   0),
            'net_retail':  round(net_retail,  0),
            'last_price':  last_price,
            'top_buyers':  buyers,
            'top_sellers': sellers,
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

        if df.empty or len(df) < 30:
            return {"status": "error", "message": f"Data {ticker} tidak cukup (< 30 hari)."}

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df.ffill(inplace=True)
        df.bfill(inplace=True)

        # 2. Load & pilih model. Range cuma butuh harga, jadi tetap dikirim walau model tidak ada.
        models, load_mode = load_models()
        if models is None:
            return {"status": "error", "message": "Tidak ada model tersedia (best_models.pkl / trading_model.pkl)",
                    "price_range": price_range(df['Close'], 5)}

        model_info, model_type = select_model(models, ticker)
        if model_info is None:
            return {"status": "error", "message": f"Tidak ada model untuk {ticker}",
                    "price_range": price_range(df['Close'], 5)}

        svm_model    = model_info['model']
        feature_cols = model_info['features']
        horizon      = model_info.get('horizon', 5)

        # 3. Hitung indikator + market regime
        df = calculate_indicators(df)
        df = add_market_features(df, fetch_market_history())
        df.dropna(inplace=True)

        if len(df) < 10:
            return {"status": "error", "message": f"Data {ticker} tidak cukup setelah kalkulasi indikator."}

        # 4. Prediksi history (60 hari terakhir)
        history_df        = df.tail(60).copy()
        available_features = [f for f in feature_cols if f in history_df.columns]
        if not available_features:
            return {"status": "error", "message": "Tidak ada fitur model yang cocok dengan data runtime."}
        X_history         = history_df[available_features].ffill().fillna(0).values

        history_preds = svm_model.predict(X_history)
        history_df    = history_df.iloc[-len(history_preds):].copy()
        history_df['pred'] = history_preds

        # 5. Backtest ringkas + confidence
        backtest = evaluate_recent_signals(history_df, horizon)
        last_price = float(df['Close'].iloc[-1])
        atr_val    = float(df['ATR'].iloc[-1])
        raw_prediction = prediction_label(history_preds[-1])

        X_last = history_df[available_features].iloc[[-1]].ffill().fillna(0).values
        strength, confidence_method = get_strength(svm_model, X_last)

        # 6. Filter kualitas sinyal
        band = fetch_bandarmology(ticker)
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
        signal_filter = apply_signal_filters(raw_prediction, strength, band, market_context, indicators)
        final_prediction = signal_filter["prediction"]
        plan = build_trading_plan(final_prediction, last_price, atr_val)

        # 7. Chart history
        chart_data = [
            {
                "time":   idx.strftime('%Y-%m-%d'),
                "open":   float(row['Open']),
                "high":   float(row['High']),
                "low":    float(row['Low']),
                "close":  float(row['Close']),
                "signal": int(row['pred']),
            }
            for idx, row in history_df.iterrows()
        ]

        # 8. Susun response
        return {
            "status":      "success",
            "ticker":      ticker.upper(),
            "model_type":  model_type,
            "prediction":  final_prediction,
            "raw_prediction": raw_prediction,
            "strength":    signal_filter["strength"],
            "confidence_method": confidence_method,
            "signal_quality": signal_filter["signal_quality"],
            "filter_score": signal_filter["filter_score"],
            "filters": signal_filter["filters"],
            "win_rate":    backtest["win_rate"],
            "backtest":    {k: v for k, v in backtest.items() if k != "recent_trades"},
            "market":      market_context,
            "trading_plan": plan,
            "price_range": price_range(df['Close'], horizon),
            "indicators":  indicators,
            "bandarmology":  band,
            "chart_history": chart_data,
            "recent_trades": backtest["recent_trades"],
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    ticker_input = sys.argv[1] if len(sys.argv) > 1 else "BBCA"
    print(json.dumps(get_prediction(ticker_input)))
