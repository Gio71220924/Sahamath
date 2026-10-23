"""Eksperimen stock picker: LGBMRanker+HMM regime vs baseline momentum, walk-forward.

Universe point-in-time: semua saham IDX (daftar dari TradingView scanner) dengan
filter likuiditas per tanggal. Sisa bias: saham delisting tidak ada di daftar/yfinance.

Tahap 6: realisme eksekusi — entry open H+1, exit open H+1+HORIZON, skip saham
yang tidak bisa dibeli karena ARA, filter harga, dan cek konsentrasi (tanpa top-5 kontributor).
Tahap 7: tambah faktor cross-section dari OHLCV (FACTORS), banding ranker tanpa/dengan faktor.
Tahap 8: tambah fundamental point-in-time (FUNDAMENTALS) dari laporan tahunan yfinance,
dianggap tersedia REPORT_LAG setelah tutup buku. Horizon bisa diganti: python train.py 20

Belum export model. Cuma print skor.
Butuh: pip install lightgbm hmmlearn  (training only, tidak masuk requirements.txt)
Run:   python train.py
Cache harga di .cache/train/ — hapus file-nya untuk download ulang.
"""
import os
import re
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from hmmlearn.hmm import GaussianHMM
from lightgbm import LGBMRanker
from scipy.stats import multivariate_normal
from ta.momentum import RSIIndicator
from ta.trend import MACD

from predict import FEE_BUFFER_PCT, add_market_features, calculate_indicators

warnings.filterwarnings("ignore")

HORIZON = int(sys.argv[1]) if __name__ == "__main__" and len(sys.argv) > 1 else 10  # hari
PERIOD = "5y"
TEST_DAYS = 63       # ~1 kuartal per fold
MIN_TRAIN_DAYS = 252
TOP_K = 10
N_REGIMES = 3
OHLCV = ["Open", "High", "Low", "Close", "Volume"]
EXTRA = ["ticker", "fwd_ret", "exec_ret", "blocked"]
CACHE = os.path.join(".cache", "train", f"ohlcv_{PERIOD}.pkl")
FUND_CACHE = os.path.join(".cache", "train", "fundamentals.pkl")
FUNDAMENTALS = ["EY", "BP", "ROE", "NI_GROWTH", "REV_GROWTH", "DER", "LOG_MCAP"]
REPORT_LAG = pd.Timedelta(days=90)  # laporan tahunan IDX wajib terbit <= akhir Maret


def idx_tickers():
    """Semua saham IDX yang listing sekarang, dari TradingView scanner (idx.co.id kena Cloudflare)."""
    r = requests.post("https://scanner.tradingview.com/indonesia/scan", timeout=30, json={
        "filter": [{"left": "type", "operation": "equal", "right": "stock"}],
        "columns": ["name"],
        "range": [0, 5000],
    })
    r.raise_for_status()
    names = [row["d"][0] for row in r.json()["data"]]
    return sorted(n for n in names if re.fullmatch(r"[A-Z]{4}", n))


def download_ohlcv():
    if os.path.exists(CACHE):
        # aman: file ini cuma ditulis oleh fungsi ini sendiri, bukan dari luar
        return pd.read_pickle(CACHE)
    tickers = idx_tickers()
    print(f"Download {len(tickers)} saham IDX ({PERIOD})...")
    parts = []
    for i in range(0, len(tickers), 100):
        chunk = [t + ".JK" for t in tickers[i:i + 100]]
        parts.append(yf.download(chunk, period=PERIOD, interval="1d", group_by="ticker",
                                 progress=False, auto_adjust=False, threads=True))
        print(f"  {min(i + 100, len(tickers))}/{len(tickers)}")
    raw = pd.concat(parts, axis=1)
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    raw.to_pickle(CACHE)
    return raw


FACTORS = ["RET_60D", "RET_120D", "MOM_12_1", "DIST_52W_HIGH", "VOL_60D", "MAX_RET_20D",
           "AMIHUD", "RSI14", "MACD_HIST_PCT"]


def add_factors(df):
    """Faktor cross-section yang dikenal di riset: momentum menengah, 52-week high,
    low-vol, MAX/lotre, illiquidity. Window 250 pakai min_periods 120 supaya data tidak habis."""
    close = df["Close"]
    ret1 = close.pct_change()
    df["RET_60D"] = close.pct_change(60)
    df["RET_120D"] = close.pct_change(120)
    df["MOM_12_1"] = close.shift(20) / close.shift(250).fillna(close.shift(120)) - 1
    df["DIST_52W_HIGH"] = close / close.rolling(250, min_periods=120).max() - 1
    df["VOL_60D"] = np.log(close).diff().rolling(60).std()
    df["MAX_RET_20D"] = ret1.rolling(20).max()
    df["AMIHUD"] = np.log1p((ret1.abs() / (close * df["Volume"])).rolling(20).mean() * 1e9)
    df["RSI14"] = RSIIndicator(close=close, window=14).rsi()
    df["MACD_HIST_PCT"] = MACD(close=close).macd_diff() / close
    return df


def fetch_statements(ticker):
    """Laporan tahunan (laba, pendapatan, ekuitas, utang, saham) per tahun buku."""
    try:
        tk = yf.Ticker(ticker + ".JK")
        inc, bs = tk.income_stmt, tk.balance_sheet

        def row(df, *keys):
            for k in keys:
                if k in df.index:
                    return df.loc[k]
            return pd.Series(np.nan, index=df.columns)

        out = pd.DataFrame({
            "ni": row(inc, "Net Income Common Stockholders", "Net Income"),
            "rev": row(inc, "Total Revenue", "Operating Revenue"),
            "equity": row(bs, "Stockholders Equity", "Common Stock Equity"),
            "debt": row(bs, "Total Debt"),
            "shares": row(bs, "Ordinary Shares Number", "Share Issued"),
        })
        out.index.name = "fy_end"
        return out.reset_index().assign(ticker=ticker)
    except Exception:
        return None


def download_fundamentals(tickers):
    if os.path.exists(FUND_CACHE):
        # aman: file ini cuma ditulis oleh fungsi ini sendiri, bukan dari luar
        return pd.read_pickle(FUND_CACHE)
    print(f"Download laporan keuangan {len(tickers)} saham...")
    with ThreadPoolExecutor(4) as pool:
        parts = [p for p in pool.map(fetch_statements, tickers) if p is not None and len(p)]
    fund = pd.concat(parts, ignore_index=True)
    fund.to_pickle(FUND_CACHE)
    return fund


def add_fundamentals(panel):
    """Gabung fundamental ke panel harian secara point-in-time (merge_asof setelah REPORT_LAG).

    ponytail: market cap = Close (split-adjusted) x jumlah saham terbaru. Konsisten terhadap
    stock split; abaikan perubahan jumlah saham dari right issue/buyback.
    """
    tickers = sorted(panel.loc[panel["VALUE_MA20"] >= 5e9, "ticker"].unique())
    fund = download_fundamentals(tickers).sort_values(["ticker", "fy_end"])
    by_ticker = fund.groupby("ticker")
    prev_ni, prev_rev = by_ticker["ni"].shift(), by_ticker["rev"].shift()
    fund["NI_GROWTH"] = (fund["ni"] - prev_ni) / prev_ni.abs()
    fund["REV_GROWTH"] = fund["rev"] / prev_rev - 1
    fund["shares_latest"] = by_ticker["shares"].transform("last")
    fund["date"] = (pd.to_datetime(fund["fy_end"]) + REPORT_LAG).astype("datetime64[ns]")
    fund = fund.dropna(subset=["ni", "equity"])
    print(f"Fundamental: {fund['ticker'].nunique()} saham, {len(fund)} laporan tahunan")

    raw_cols = ["ni", "rev", "equity", "debt", "shares_latest", "NI_GROWTH", "REV_GROWTH"]
    p = panel.reset_index()
    p["date"] = p["date"].astype("datetime64[ns]")
    m = pd.merge_asof(p.sort_values("date"), fund[["date", "ticker"] + raw_cols].sort_values("date"),
                      on="date", by="ticker")
    mcap = m["Close"] * m["shares_latest"]
    pos_equity = m["equity"].where(m["equity"] > 0)
    m["EY"] = m["ni"] / mcap
    m["BP"] = m["equity"] / mcap
    m["ROE"] = m["ni"] / pos_equity
    m["DER"] = m["debt"] / pos_equity
    m["LOG_MCAP"] = np.log(mcap)
    m = m.drop(columns=["ni", "rev", "equity", "debt", "shares_latest"])
    return m.sort_values(["ticker", "date"]).set_index("date").replace([np.inf, -np.inf], np.nan)


def ara_limit(price):
    """Batas ARA IDX per fraksi harga."""
    return np.select([price < 200, price <= 5000], [0.35, 0.25], 0.20)


def load_panel():
    raw = download_ohlcv()
    market = yf.download("^JKSE", period=PERIOD, interval="1d", progress=False, auto_adjust=False)
    if isinstance(market.columns, pd.MultiIndex):
        market.columns = market.columns.get_level_values(0)

    frames = []
    for jk in raw.columns.get_level_values(0).unique():
        df = raw[jk][OHLCV].apply(pd.to_numeric, errors="coerce").dropna(subset=["Close"])
        df = df[(df["Volume"] > 0) & (df["Open"] > 0)]  # hari suspend / data rusak
        if len(df) < MIN_TRAIN_DAYS:
            continue
        df = add_factors(add_market_features(calculate_indicators(df.copy()), market))
        close, nxt_open = df["Close"], df["Open"].shift(-1)
        df["fwd_ret"] = close.shift(-HORIZON) / close - 1                       # label training
        df["exec_ret"] = df["Open"].shift(-(HORIZON + 1)) / nxt_open - 1        # beli open H+1
        # tidak bisa dibeli: close hari ini ARA, atau besok buka langsung ARA (tolerans 1% fraksi)
        prev_close = close.shift(1)
        df["blocked"] = ((close / prev_close - 1 >= ara_limit(prev_close) - 0.01)
                         | (nxt_open / close - 1 >= ara_limit(close) - 0.01))
        df["ticker"] = jk.removesuffix(".JK")
        frames.append(df)

    panel = pd.concat(frames)
    panel.index = pd.to_datetime(panel.index).normalize()
    panel.index.name = "date"
    return panel.replace([np.inf, -np.inf], np.nan), market


def prepare(panel, min_value, min_price):
    features = [c for c in panel.columns if c not in OHLCV + EXTRA]
    # VALUE_MA20 & Close cuma pakai data <= t, jadi filter ini point-in-time
    panel = panel[(panel["VALUE_MA20"] >= min_value) & (panel["Close"] >= min_price)]
    # fundamental boleh kosong (sebelum laporan pertama terbit) → rank netral 0.5 di bawah
    required = [f for f in features if f not in FUNDAMENTALS]
    panel = panel.dropna(subset=required + ["fwd_ret", "exec_ret"]).reset_index()
    # ranker butuh baris kontinu per tanggal; qcut 5 butuh >= 5 ticker per tanggal
    panel = panel[panel.groupby("date")["ticker"].transform("size") >= 5]
    panel = panel.sort_values(["date", "ticker"]).reset_index(drop=True)
    # rank per tanggal → skala 0..1, harga mahal vs murah jadi sebanding
    X = panel.groupby("date")[features].rank(pct=True).fillna(0.5)
    panel["label_rank"] = panel.groupby("date")["fwd_ret"].transform(
        lambda s: pd.qcut(s.rank(method="first"), 5, labels=False)).astype(int)
    return panel, X


def market_obs(market):
    logret = np.log(market["Close"]).diff()
    obs = pd.DataFrame({"ret": logret, "vol": logret.rolling(20).std()}).dropna()
    obs.index = pd.to_datetime(obs.index).normalize()
    return obs


def regime_probs(obs, train_end):
    """Fit HMM di data <= train_end, lalu filtered prob (forward pass) untuk semua tanggal.

    Filtered = prob di hari t cuma pakai data <= t. Jangan pakai hmm.predict_proba:
    itu smoothed (forward-backward), ngintip data masa depan.
    """
    fit_obs = obs[obs.index <= train_end]
    z = ((obs - fit_obs.mean()) / fit_obs.std()).values  # skala dari train saja
    hmm = GaussianHMM(N_REGIMES, covariance_type="full", n_iter=200, random_state=0)
    hmm.fit(z[:len(fit_obs)])
    emis = np.column_stack([
        multivariate_normal(hmm.means_[k], hmm.covars_[k], allow_singular=True).pdf(z)
        for k in range(N_REGIMES)])
    alpha = np.empty_like(emis)
    prior = hmm.startprob_
    for t in range(len(emis)):
        a = emis[t] * prior + 1e-300
        alpha[t] = a / a.sum()
        prior = alpha[t] @ hmm.transmat_
    order = np.argsort(hmm.means_[:, 0])  # P0 = bearish ... P2 = bullish
    return pd.DataFrame(alpha[:, order], index=obs.index,
                        columns=[f"REGIME_P{k}" for k in range(N_REGIMES)])


def walk_forward(dates):
    """Expanding window. Purge HORIZON+1 hari (exec_ret pakai open H+1) supaya label tidak bocor."""
    for start in range(MIN_TRAIN_DAYS, len(dates) - HORIZON, TEST_DAYS):
        yield dates[:start - HORIZON - 1], dates[start:start + TEST_DAYS]


def fit_ranker(X_train, train):
    model = LGBMRanker(objective="lambdarank", n_estimators=200, learning_rate=0.05,
                       num_leaves=15, min_child_samples=50, verbose=-1)
    model.fit(X_train, train["label_rank"], group=train.groupby("date", sort=False).size().values)
    return model.predict


def backtest(test, score, prev, realistic):
    """Rebalance tiap HORIZON hari. Fee (round-trip) cuma untuk saham yang diganti.

    realistic=False: beli di close hari sinyal (versi lama, optimis).
    realistic=True : beli open H+1, saham ARA di-skip → ambil peringkat berikutnya.
    Return juga kontribusi excess per saham (sebelum fee).
    """
    ret_col = "exec_ret" if realistic else "fwd_ret"
    test = test.assign(score=score)
    periods, contrib = [], []
    for d in np.sort(test["date"].unique())[::HORIZON]:
        day = test[test["date"] == d]
        buyable = day[~day["blocked"]] if realistic else day
        picked = buyable.nlargest(TOP_K, "score")
        picks = set(picked["ticker"])
        turnover = 1.0 if prev is None else len(picks - prev) / TOP_K
        univ = day[ret_col].mean()
        periods.append((picked[ret_col].mean() - turnover * FEE_BUFFER_PCT / 100, univ, turnover,
                        day["blocked"].sum()))
        contrib += [(t, (r - univ) / len(picked)) for t, r in picked[["ticker", ret_col]].values]
        prev = picks
    net, univ, turnover, blocked = np.array(periods).T
    return {
        "net%": net.mean() * 100,
        "univ%": univ.mean() * 100,
        # ponytail: annualisasi simple (bukan compound), cukup untuk banding antar skenario
        "excess%/thn": (net - univ).mean() * 100 * 252 / HORIZON,
        "turnover": turnover.mean(),
        "ara/hari": blocked.mean(),
        "periods": len(periods),
    }, prev, contrib


def main():
    panel_raw, market = load_panel()
    panel_raw = add_fundamentals(panel_raw)
    obs = market_obs(market)
    # nama: (min nilai transaksi/hari, min harga, eksekusi realistis)
    scenarios = {
        "5M_open+ARA+px100":  (5e9, 100, True),
        "20M_open+ARA+px100": (2e10, 100, True),
    }

    regime_cache = {}
    rows, contribs = [], []
    for scenario, (min_value, min_price, realistic) in scenarios.items():
        panel, X = prepare(panel_raw, min_value, min_price)
        dates = np.sort(panel["date"].unique())
        prev = {}  # portfolio terakhir per model, nyambung antar fold
        for i, (train_dates, test_dates) in enumerate(walk_forward(dates)):
            tr = panel["date"].isin(train_dates).values
            te = panel["date"].isin(test_dates).values
            train, test = panel[tr], panel[te]

            train_end = pd.Timestamp(train_dates[-1])
            if train_end not in regime_cache:
                regime_cache[train_end] = regime_probs(obs, train_end)
            R = regime_cache[train_end].reindex(
                pd.DatetimeIndex(panel["date"]), method="ffill").fillna(1 / N_REGIMES)
            XR = pd.concat([X, R.set_index(X.index)], axis=1)

            # baseline tanpa ML: top-10 momentum 20 hari. ML harus mengalahkan ini.
            XT = XR.drop(columns=FUNDAMENTALS)
            scores = {"momentum20": test["RET_20D"].values,
                      # baseline fundamental tanpa ML: murah (EY tinggi) + berkualitas (ROE tinggi)
                      "value+quality": (XR.loc[te, "EY"] + XR.loc[te, "ROE"]).values,
                      "ranker+faktor": fit_ranker(XT[tr], train)(XT[te]),
                      "ranker+faktor+fund": fit_ranker(XR[tr], train)(XR[te])}
            for name, score in scores.items():
                metrics, prev[name], contrib = backtest(test, score, prev.get(name), realistic)
                rows.append({"scenario": scenario, "fold": i, "model": name, **metrics})
                contribs += [(scenario, name, t, c) for t, c in contrib]
        print(f"{scenario}: {panel['ticker'].nunique()} ticker, rata-rata "
              f"{panel.groupby('date').size().mean():.0f}/hari, {i + 1} fold")

    res = pd.DataFrame(rows)
    c = pd.DataFrame(contribs, columns=["scenario", "model", "ticker", "contrib"])
    keys = ["scenario", "model"]
    summary = res.groupby(keys, sort=False)[["net%", "univ%", "excess%/thn", "turnover", "ara/hari"]].mean()
    summary["beat_univ"] = res.assign(b=res["excess%/thn"] > 0).groupby(keys, sort=False)["b"].mean()
    # konsentrasi: buang kontribusi 5 saham terbaik, disetahunkan per periode rebalance
    per_ticker = c.groupby(keys + ["ticker"])["contrib"].sum()
    top5 = per_ticker.groupby(level=keys, sort=False).apply(lambda s: s.nlargest(5).sum())
    periods = res.groupby(keys, sort=False)["periods"].sum()
    summary["tanpa_top5%/thn"] = summary["excess%/thn"] - (top5 / periods * 100 * 252 / HORIZON)
    print(f"\n== H{HORIZON}, top-{TOP_K}, fee {FEE_BUFFER_PCT}% round-trip per saham yang diganti ==")
    print(summary.round(2).to_string())

    for scenario in scenarios:
        s = per_ticker.loc[scenario, "ranker+faktor+fund"].sort_values(ascending=False) * 100
        print(f"\n== Kontributor ranker+faktor+fund [{scenario}] ({len(s)} saham, total {s.sum():.1f}% poin) ==")
        print(pd.concat([s.head(8), s.tail(3)]).round(2).to_string())


if __name__ == "__main__":
    main()
