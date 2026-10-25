#!/usr/bin/env python3
"""
portfolio.py - Risk-profile portfolio optimizer (Modern Portfolio Theory).

Given a risk profile (and optional custom ticker list), download ~1y of daily
IDX prices, compute annualized return + covariance, then build the efficient
frontier via Monte Carlo (numpy only). If SciPy is available, refine the
max-Sharpe and min-volatility portfolios with a real optimizer; otherwise fall
back to the best Monte Carlo samples.

Output: JSON on stdout. EDUCATIONAL ONLY — not investment advice.

Usage:
    python portfolio.py --risk moderate
    python portfolio.py --risk aggressive --tickers BBCA,TLKM,ANTM,GOTO
"""
import argparse
import json
import sys

TRADING_DAYS = 252
RISK_FREE = 0.06  # ~BI rate, annual
MC_SAMPLES = 8000
MAX_WEIGHT = 0.25  # bobot maksimal per saham di hasil optimasi

# Curated per-profile universes (liquid IDX names). Custom tickers, when given,
# are merged on top so the user can extend or replace the default set.
UNIVERSE = {
    "conservative": ["BBCA", "BBRI", "BMRI", "TLKM", "ICBP", "UNVR", "KLBF", "ASII", "SMGR", "INDF"],
    "moderate":     ["BBCA", "BBRI", "TLKM", "ASII", "ANTM", "ADRO", "UNTR", "PGAS", "CPIN", "AMRT", "ICBP", "MAPI"],
    "aggressive":   ["BBRI", "ASII", "ANTM", "ADRO", "BUMI", "GOTO", "BREN", "CUAN", "MDKA", "BRPT", "MEDC", "PTBA"],
}

DISCLAIMER = (
    "Edukasi & simulasi kuantitatif, BUKAN rekomendasi investasi. "
    "Kinerja masa lalu tidak menjamin hasil di masa depan. "
    "Keputusan investasi sepenuhnya tanggung jawab Anda."
)


def fail(message):
    print(json.dumps({"status": "error", "message": message}))
    sys.exit(0)


def resolve_universe(risk, custom):
    base = list(UNIVERSE.get(risk, UNIVERSE["moderate"]))
    if custom:
        for t in custom:
            if t not in base:
                base.append(t)
    # de-dup, cap to keep the optimization fast and stable
    seen, out = set(), []
    for t in base:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out[:14]


def download_prices(tickers):
    import yfinance as yf
    symbols = [f"{t}.JK" for t in tickers]
    raw = yf.download(symbols, period="1y", interval="1d",
                      auto_adjust=True, progress=False, threads=True)
    # yf returns a column MultiIndex; grab Close
    close = raw["Close"] if "Close" in raw else raw
    close = close.dropna(axis=1, how="all").dropna()
    return close


def portfolio_stats(weights, mean_returns, cov):
    import numpy as np
    ret = float(np.dot(weights, mean_returns))
    vol = float(np.sqrt(np.dot(weights.T, np.dot(cov, weights))))
    sharpe = (ret - RISK_FREE) / vol if vol > 0 else 0.0
    return ret, vol, sharpe


def monte_carlo(mean_returns, cov, n_assets):
    import numpy as np
    rng = np.random.default_rng(42)
    weights = rng.dirichlet(np.ones(n_assets), size=MC_SAMPLES)
    rets = weights @ mean_returns
    vols = np.sqrt(np.einsum("ij,jk,ik->i", weights, cov, weights))
    sharpes = np.where(vols > 0, (rets - RISK_FREE) / vols, 0.0)
    return weights, rets, vols, sharpes


def refine_scipy(mean_returns, cov, n_assets, objective):
    """Refine with SLSQP if SciPy is present; return weights or None."""
    try:
        import numpy as np
        from scipy.optimize import minimize
    except Exception:
        return None

    # Maks 25% per saham supaya alokasi tidak menumpuk di satu nama (dulu Moderat bisa 54% ADRO).
    cap = max(MAX_WEIGHT, 1.0 / n_assets)
    bounds = tuple((0.0, cap) for _ in range(n_assets))
    constraints = ({"type": "eq", "fun": lambda w: np.sum(w) - 1.0},)
    x0 = np.repeat(1.0 / n_assets, n_assets)

    def neg_sharpe(w):
        r = np.dot(w, mean_returns)
        v = np.sqrt(np.dot(w.T, np.dot(cov, w)))
        return -(r - RISK_FREE) / v if v > 0 else 1e9

    def vol(w):
        return np.sqrt(np.dot(w.T, np.dot(cov, w)))

    fn = neg_sharpe if objective == "sharpe" else vol
    res = minimize(fn, x0, method="SLSQP", bounds=bounds, constraints=constraints)
    return res.x if res.success else None


def pack(weights, tickers, mean_returns, cov):
    import numpy as np
    weights = np.asarray(weights, dtype=float)
    weights = np.where(weights < 0.005, 0.0, weights)  # drop dust
    if weights.sum() <= 0:
        weights = np.repeat(1.0 / len(tickers), len(tickers))
    weights = weights / weights.sum()
    ret, vol, sharpe = portfolio_stats(weights, mean_returns, cov)
    alloc = [
        {"ticker": t, "weight": round(float(w) * 100, 2)}
        for t, w in zip(tickers, weights) if w > 0
    ]
    alloc.sort(key=lambda a: a["weight"], reverse=True)
    return {
        "weights": alloc,
        "return": round(ret * 100, 2),
        "volatility": round(vol * 100, 2),
        "sharpe": round(sharpe, 2),
    }


def blend(w_a, w_b):
    import numpy as np
    return (np.asarray(w_a) + np.asarray(w_b)) / 2.0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--risk", default="moderate",
                        choices=["conservative", "moderate", "aggressive"])
    parser.add_argument("--tickers", default="")
    args = parser.parse_args()

    custom = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    custom = [t for t in custom if len(t) == 4 and t.isalpha()]
    tickers = resolve_universe(args.risk, custom)
    if len(tickers) < 2:
        fail("Butuh minimal 2 saham untuk optimasi portofolio.")

    try:
        import numpy as np  # noqa: F401
    except Exception:
        fail("numpy tidak tersedia di environment Python.")

    try:
        close = download_prices(tickers)
    except Exception as e:
        fail(f"Gagal memuat harga: {e}")

    if close.shape[1] < 2 or close.shape[0] < 30:
        fail("Data harga tidak cukup untuk optimasi (butuh >=2 saham, >=30 hari).")

    import numpy as np
    tickers = [c.replace(".JK", "") for c in close.columns]
    returns = close.pct_change().dropna()
    mean_returns = returns.mean().values * TRADING_DAYS
    cov = returns.cov().values * TRADING_DAYS
    n = len(tickers)

    mc_w, mc_r, mc_v, mc_s = monte_carlo(mean_returns, cov, n)

    # Max-Sharpe & Min-Vol: SciPy refinement if available, else best MC sample.
    max_sharpe_w = refine_scipy(mean_returns, cov, n, "sharpe")
    if max_sharpe_w is None:
        max_sharpe_w = mc_w[int(np.argmax(mc_s))]
    min_vol_w = refine_scipy(mean_returns, cov, n, "vol")
    if min_vol_w is None:
        min_vol_w = mc_w[int(np.argmin(mc_v))]

    max_sharpe = pack(max_sharpe_w, tickers, mean_returns, cov)
    min_vol = pack(min_vol_w, tickers, mean_returns, cov)

    if args.risk == "conservative":
        recommended = min_vol
    elif args.risk == "aggressive":
        recommended = max_sharpe
    else:
        recommended = pack(blend(max_sharpe_w, min_vol_w), tickers, mean_returns, cov)

    # Downsample the Monte Carlo cloud for a frontier scatter on the client.
    idx = np.linspace(0, MC_SAMPLES - 1, 160).astype(int)
    frontier = [
        {"vol": round(float(mc_v[i]) * 100, 2),
         "ret": round(float(mc_r[i]) * 100, 2),
         "sharpe": round(float(mc_s[i]), 2)}
        for i in idx
    ]

    print(json.dumps({
        "status": "ok",
        "risk": args.risk,
        "universe": tickers,
        "risk_free": round(RISK_FREE * 100, 2),
        "recommended": recommended,
        "max_sharpe": max_sharpe,
        "min_vol": min_vol,
        "frontier": frontier,
        "method": "monte_carlo+scipy" if max_sharpe_w is not None else "monte_carlo",
        "disclaimer": DISCLAIMER,
    }))


if __name__ == "__main__":
    main()
