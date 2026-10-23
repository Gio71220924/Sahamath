import sys
import json
import warnings
import pandas as pd
import numpy as np
import yfinance as yf

warnings.filterwarnings("ignore")

from ta.volatility import BollingerBands, AverageTrueRange
from ta.momentum import StochasticOscillator, RSIIndicator
from ta.volume import OnBalanceVolumeIndicator, ChaikinMoneyFlowIndicator, MFIIndicator
from ta.trend import ADXIndicator, MACD, EMAIndicator

TICKERS = [
    'ADRO', 'AKRA', 'BUMI', 'BYAN', 'DEWA', 'DSSA',
    'ENRG', 'GEMS', 'ITMG', 'MEDC', 'PGAS', 'PTBA', 'PTRO', 'RAJA'
]

def calculate_indicators(df):
    close  = df['Close'].squeeze()
    high   = df['High'].squeeze()
    low    = df['Low'].squeeze()
    volume = df['Volume'].squeeze()

    bb = BollingerBands(close=close, window=20, window_dev=2)
    df['BB_MIDDLE'] = bb.bollinger_mavg()
    df['BB_UPPER']  = bb.bollinger_hband()
    df['BB_LOWER']  = bb.bollinger_lband()

    stoch = StochasticOscillator(high=high, low=low, close=close, window=14, smooth_window=3)
    df['STOCH_%K'] = stoch.stoch()
    df['STOCH_%D'] = stoch.stoch_signal()

    adx = ADXIndicator(high=high, low=low, close=close, window=14)
    df['ADX'] = adx.adx()
    df['ADX_POS'] = adx.adx_pos()
    df['ADX_NEG'] = adx.adx_neg()

    df['OBV'] = OnBalanceVolumeIndicator(close=close, volume=volume).on_balance_volume()

    atr = AverageTrueRange(high=high, low=low, close=close, window=14)
    df['ATR']     = atr.average_true_range()
    df['ATR_pct'] = df['ATR'] / df['Close']
    df['RET_1D'] = close.pct_change(1)
    df['RET_3D'] = close.pct_change(3)
    df['RET_5D'] = close.pct_change(5)
    df['MA20']    = close.rolling(20).mean()
    df['MA50']    = close.rolling(50).mean()

    # RSI
    df['RSI'] = RSIIndicator(close=close, window=14).rsi()

    # MACD
    macd_obj = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    df['MACD']        = macd_obj.macd()
    df['MACD_SIGNAL'] = macd_obj.macd_signal()
    df['MACD_DIFF']   = macd_obj.macd_diff()

    # EMA (untuk Institutional Trend)
    df['EMA20'] = EMAIndicator(close=close, window=20).ema_indicator()
    df['EMA50'] = EMAIndicator(close=close, window=50).ema_indicator()
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
    df['VSA_DEMAND'] = (strong_volume & close_top & (df['RET_1D'] > 0)).astype(int)
    df['VSA_SUPPLY_RISK'] = (high_volume & close_bottom & wide_spread).astype(int)
    df['VSA_ACCUMULATION'] = (high_volume & close_top & (df['RET_5D'] <= 0)).astype(int)
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


def add_market_features(df, market=None):
    df['RET_20D'] = df['Close'].pct_change(20)

    if market is None or market.empty:
        df['IHSG_RET_20D'] = 0.0
        df['REL_STRENGTH_20D'] = df['RET_20D'].fillna(0)
        df['MARKET_ABOVE_MA20'] = 1
        df['MARKET_REGIME_SCORE'] = 0
        return df

    market = market.copy()
    market.index = pd.to_datetime(market.index).normalize()
    lookup_index = pd.to_datetime(df.index).normalize()
    aligned = market.reindex(lookup_index, method='ffill').bfill()
    aligned.index = df.index
    if 'Close' not in aligned or aligned['Close'].isna().all():
        df['IHSG_RET_20D'] = 0.0
        df['REL_STRENGTH_20D'] = df['RET_20D'].fillna(0)
        df['MARKET_ABOVE_MA20'] = 1
        df['MARKET_REGIME_SCORE'] = 0
        return df
    mclose = aligned['Close'].replace(0, np.nan)
    ma20 = mclose.rolling(20).mean()
    df['IHSG_RET_20D'] = mclose.pct_change(20)
    df['REL_STRENGTH_20D'] = df['RET_20D'] - df['IHSG_RET_20D']
    df['MARKET_ABOVE_MA20'] = (mclose > ma20).astype(int)
    df['MARKET_REGIME_SCORE'] = np.select(
        [
            (df['IHSG_RET_20D'] > 0.03) & (df['MARKET_ABOVE_MA20'] == 1),
            (df['IHSG_RET_20D'] < -0.03) & (df['MARKET_ABOVE_MA20'] == 0),
        ],
        [1, -1],
        default=0,
    )
    return df


def safe_float(val, digits=4):
    try:
        v = float(val)
        return round(v, digits) if not np.isnan(v) else None
    except Exception:
        return None


def tick_size(price):
    if price < 200:
        return 1
    if price < 500:
        return 2
    if price < 2000:
        return 5
    if price < 5000:
        return 10
    return 25


def round_to_tick(price, mode='nearest'):
    if price is None or not np.isfinite(price) or price <= 0:
        return None
    tick = tick_size(price)
    if mode == 'up':
        return int(np.ceil(price / tick) * tick)
    if mode == 'down':
        return int(np.floor(price / tick) * tick)
    return int(round(price / tick) * tick)


def detect_vsa(df):
    last = df.iloc[-1]
    close = float(last['Close'])
    open_ = float(last['Open'])
    vol_ratio = safe_float(last.get('vol_ratio')) or 0
    spread_ratio = safe_float(last.get('SPREAD_RATIO')) or 0
    close_pos = safe_float(last.get('close_pos')) or 0
    ret_3d = (close / float(df['Close'].iloc[-4]) - 1) if len(df) >= 4 and float(df['Close'].iloc[-4]) > 0 else 0

    if vol_ratio >= 2.5 and spread_ratio >= 1.4 and close_pos < 0.5:
        return {'label': 'Climax Risk', 'score': -2}
    if close > open_ and vol_ratio < 0.8 and close_pos < 0.65:
        return {'label': 'Weak Rally', 'score': -1}
    if close > open_ and vol_ratio >= 1.2 and close_pos >= 0.65 and spread_ratio >= 0.8:
        return {'label': 'Demand Bar', 'score': 2}
    if close < open_ and vol_ratio < 0.8 and spread_ratio < 0.85:
        return {'label': 'No Supply', 'score': 2}
    if close < open_ and ret_3d < -0.03 and vol_ratio >= 1.6 and close_pos >= 0.45:
        return {'label': 'Stopping Volume', 'score': 2}
    if vol_ratio >= 1.3 and close_pos >= 0.6:
        return {'label': 'Accumulation', 'score': 1}
    return {'label': 'Neutral', 'score': 0}


def triple_confirmation(df):
    if len(df) < 30:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) >= 2 else last

    rsi       = safe_float(last.get('RSI'))
    macd      = safe_float(last.get('MACD'))
    macd_sig  = safe_float(last.get('MACD_SIGNAL'))
    macd_prev = safe_float(prev.get('MACD'))
    msig_prev = safe_float(prev.get('MACD_SIGNAL'))
    close     = safe_float(last.get('Close'))
    ma20      = safe_float(last.get('MA20'))

    if any(v is None for v in [rsi, macd, macd_sig, close, ma20]):
        return None

    bullish_cross = (macd > macd_sig and macd_prev is not None and msig_prev is not None and macd_prev <= msig_prev)
    bearish_cross = (macd < macd_sig and macd_prev is not None and msig_prev is not None and macd_prev >= msig_prev)
    above_ma20    = close > ma20

    buy_score = 0
    if rsi < 40:
        buy_score += round(33 * (40 - rsi) / 40)
    if bullish_cross:
        buy_score += 33
    if above_ma20:
        buy_score += min(34, round(34 * (1 + (close - ma20) / ma20)))

    sell_score = 0
    if rsi > 60:
        sell_score += round(33 * (rsi - 60) / 40)
    if bearish_cross:
        sell_score += 33
    if not above_ma20:
        sell_score += min(34, round(34 * (1 + (ma20 - close) / ma20)))

    # Tiered: 3/3 aligned = STRONG, 2/3 = LEAN (partial setup worth watching),
    # else NEUTRAL. Buy/sell conditions are pairwise mutually exclusive, so
    # buy_hits and sell_hits can never both reach 2.
    buy_hits  = sum([rsi < 40, bullish_cross, above_ma20])
    sell_hits = sum([rsi > 60, bearish_cross, not above_ma20])
    if buy_hits == 3:
        signal, score = 'STRONG BUY', min(100, buy_score)
    elif sell_hits == 3:
        signal, score = 'STRONG SELL', min(100, sell_score)
    elif buy_hits == 2:
        signal, score = 'LEAN BUY', min(100, buy_score)
    elif sell_hits == 2:
        signal, score = 'LEAN SELL', min(100, sell_score)
    else:
        signal, score = 'NEUTRAL', max(buy_score, sell_score)

    return {
        'signal':            signal,
        'score':             score,
        'rsi':               round(rsi, 1),
        'macd_signal':       'bullish_cross' if bullish_cross else 'bearish_cross' if bearish_cross else 'no_cross',
        'macd_value':        round(macd, 4),
        'ma20_position':     'above' if above_ma20 else 'below',
        'ma20_distance_pct': round((close - ma20) / ma20 * 100, 2) if ma20 else None,
    }


def build_swing_setup(df):
    last = df.iloc[-1]
    close = float(last['Close'])
    ma20 = safe_float(last.get('MA20'))
    ma50 = safe_float(last.get('MA50'))
    ma20_slope = safe_float(last.get('MA20_SLOPE')) or 0
    rel_strength = safe_float(last.get('REL_STRENGTH_20D')) or 0
    adx = safe_float(last.get('ADX')) or 0
    vol_ratio = safe_float(last.get('vol_ratio')) or 0
    cmf = safe_float(last.get('CMF')) or 0
    close_pos = safe_float(last.get('close_pos')) or 0
    stoch = safe_float(last.get('STOCH_%K')) or 0
    atr = safe_float(last.get('ATR')) or 0
    recent_high = float(df['High'].tail(5).max())
    recent_low = float(df['Low'].tail(10).min())
    vsa = detect_vsa(df)

    score = 0
    if ma20 and close > ma20:
        score += 2
    if ma50 and close > ma50:
        score += 2
    if ma20 and ma50 and ma20 > ma50:
        score += 1
    if ma20_slope > 0:
        score += 1
    if rel_strength > 0:
        score += 2
    if adx >= 18:
        score += 1
    if vol_ratio >= 1.2:
        score += 1
    if cmf > 0:
        score += 1
    if close_pos >= 0.6:
        score += 1
    if stoch > 85:
        score -= 1
    score += vsa['score']
    score = max(0, min(12, score))

    if score >= 9:
        label = 'Strong Swing'
    elif score >= 6:
        label = 'Watchlist'
    elif score >= 4:
        label = 'Early Setup'
    else:
        label = 'Skip'

    trigger = max(close, recent_high)
    bo_entry = round_to_tick(trigger, 'up')

    pullback_candidates = []
    if atr > 0:
        pullback_candidates.append(close - atr * 0.5)
    if ma20 and close >= ma20:
        pullback_candidates.append(ma20)
    raw_pb = max([p for p in pullback_candidates if p and p > 0], default=close * 0.985)
    raw_pb = min(raw_pb, close)
    pb_entry = round_to_tick(raw_pb, 'down')

    atr_stop = close - atr * 1.5 if atr > 0 else close * 0.94
    ma_stop = ma20 * 0.98 if ma20 else close * 0.94
    raw_sl = max(recent_low, atr_stop, ma_stop)
    lowest_entry = min([p for p in [bo_entry, pb_entry] if p and p > 0], default=bo_entry)
    sl_guard_applied = False
    if raw_sl >= lowest_entry:
        guard_distance = max((atr * 1.5) if atr > 0 else 0, lowest_entry * 0.03)
        raw_sl = lowest_entry - guard_distance
        sl_guard_applied = True
    stop_loss = round_to_tick(raw_sl, 'down')
    if stop_loss and lowest_entry and stop_loss >= lowest_entry:
        stop_loss = round_to_tick(lowest_entry - tick_size(lowest_entry), 'down')
        sl_guard_applied = True
    risk = bo_entry - stop_loss if bo_entry and stop_loss else 0
    target = round_to_tick(bo_entry + risk * 2, 'down') if risk > 0 else None

    return {
        'score': round(score, 1),
        'setup': label,
        'vsa': vsa['label'],
        'entry': bo_entry,
        'bo_entry': bo_entry,
        'pb_entry': pb_entry,
        'target': target,
        'stop_loss': stop_loss,
        'sl_guard_applied': sl_guard_applied,
        'risk_pct': round((risk / bo_entry) * 100, 2) if bo_entry and risk > 0 else None,
        'rr': 2 if risk > 0 else None,
        'volume_ratio': safe_float(last.get('vol_ratio')),
        'relative_strength_20d': safe_float(last.get('REL_STRENGTH_20D')),
    }


def screen_ticker(ticker, df_raw, market_df=None, strategies=None):
    try:
        # Extract single-ticker slice dari batch download
        if isinstance(df_raw.columns, pd.MultiIndex):
            cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            ticker_jk = ticker + '.JK'
            # yfinance group_by='ticker' produces (Ticker, Price) level order
            if df_raw.columns.names[0] == 'Ticker':
                df = pd.DataFrame({
                    c: df_raw[(ticker_jk, c)] for c in cols
                    if (ticker_jk, c) in df_raw.columns
                })
            else:
                df = pd.DataFrame({
                    c: df_raw[(c, ticker_jk)] for c in cols
                    if (c, ticker_jk) in df_raw.columns
                })
        else:
            df = df_raw.copy()

        if df.empty or len(df) < 30:
            return {'ticker': ticker, 'status': 'error', 'message': 'Data tidak cukup'}

        for col in ['Open', 'High', 'Low', 'Close', 'Volume']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        df.ffill(inplace=True)
        df.bfill(inplace=True)
        df.dropna(subset=['Close'], inplace=True)

        df = calculate_indicators(df)
        df = add_market_features(df, market_df)
        df.dropna(inplace=True)

        if len(df) < 10:
            return {'ticker': ticker, 'status': 'error', 'message': 'Data tidak cukup setelah indikator'}

        last = df.iloc[-1]
        swing = build_swing_setup(df)

        strategy_results = {}
        if strategies and 'triple' in strategies:
            tc = triple_confirmation(df)
            if tc:
                strategy_results['triple'] = tc

        return {
            'ticker':     ticker,
            'status':     'success',
            'price':      safe_float(last.get('Close')),
            'swing':      swing,
            'strategies': strategy_results,
            'market': {
                'regime': 'bullish' if int(safe_float(last.get('MARKET_REGIME_SCORE'), 0) or 0) > 0 else 'bearish' if int(safe_float(last.get('MARKET_REGIME_SCORE'), 0) or 0) < 0 else 'sideways',
                'relative_strength_20d': safe_float(last.get('REL_STRENGTH_20D')),
            },
            'indicators': {
                'stoch': safe_float(last.get('STOCH_%K')),
                'cmf':   safe_float(last.get('CMF')),
                'adx':   safe_float(last.get('ADX')),
                'vol_ratio': safe_float(last.get('vol_ratio')),
            },
        }

    except Exception as e:
        return {'ticker': ticker, 'status': 'error', 'message': str(e)}


def run_screener(strategies=None, mode='and'):
    if strategies is None:
        strategies = ['triple']

    tickers_jk = [t + '.JK' for t in TICKERS]
    try:
        df_all = yf.download(
            tickers_jk, period='250d', interval='1d',
            progress=False, auto_adjust=False, group_by='ticker'
        )
        market_df = yf.download(
            '^JKSE', period='260d', interval='1d',
            progress=False, auto_adjust=False
        )
        if isinstance(market_df.columns, pd.MultiIndex):
            market_df.columns = market_df.columns.get_level_values(0)
    except Exception as e:
        print(json.dumps({'status': 'error', 'message': f'Download gagal: {e}'}))
        return

    results = [screen_ticker(t, df_all, market_df, strategies=strategies) for t in TICKERS]
    results.sort(key=lambda r: r.get('swing', {}).get('score', -1) if r.get('status') == 'success' else -1, reverse=True)
    print(json.dumps({'status': 'ok', 'mode': mode, 'strategies': strategies, 'results': results}))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--strategies', default='triple')
    parser.add_argument('--mode', default='and', choices=['and', 'or'])
    args = parser.parse_args()
    run_screener(
        strategies=[s.strip() for s in args.strategies.split(',')],
        mode=args.mode,
    )
