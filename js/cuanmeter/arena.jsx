/* ============================================================
   arena.jsx - Arena FO: synthetic order book + fast order entry.
   Market/account behavior lives in the existing engine and store;
   this file owns the Hybrid Pro trading interface.
   ============================================================ */

const { useState: useStateAA, useEffect: useEffectAA, useRef: useRefAA } = React;

function arRp(value) {
  return 'Rp ' + Math.round(value || 0).toLocaleString('id-ID');
}

function arShort(value) {
  const amount = Number(value) || 0;
  const absolute = Math.abs(amount);
  if (absolute >= 1e12) return 'Rp ' + (amount / 1e12).toFixed(2).replace('.', ',') + ' T';
  if (absolute >= 1e9) return 'Rp ' + (amount / 1e9).toFixed(2).replace('.', ',') + ' M';
  if (absolute >= 1e6) return 'Rp ' + (amount / 1e6).toFixed(1).replace('.', ',') + ' jt';
  return arRp(amount);
}

// Realistic order frequency per price level. Real boards show many resting
// orders per level; cheaper shares attract far more retail participants than
// expensive ones. Derive a display frequency from the level lot scaled by a
// per-share price factor (sub-linear in lot, so deep levels read ~tens-hundreds)
// instead of exposing the handful of synthetic sub-orders actually maintained.
function arenaSyntheticFreq(lot, price) {
  if (!(lot > 0)) return 0;
  const sharePrice = Number(price) || 0;
  const priceFactor = sharePrice < 100 ? 0.55
    : sharePrice < 500 ? 0.34
      : sharePrice < 2_000 ? 0.2
        : sharePrice < 5_000 ? 0.12
          : 0.07;
  return Math.max(1, Math.round(Math.sqrt(lot) * priceFactor));
}

function arenaDepthWidth(lot, maxLot) {
  if (!(lot > 0) || !(maxLot > 0)) return 0;
  return Math.max(7, Math.min(100, Math.sqrt(lot / maxLot) * 100));
}

function arenaCompactLot(value) {
  const lot = Math.max(0, Number(value) || 0);
  if (lot < 1_000) return Math.round(lot).toLocaleString('id-ID');
  const divisor = lot >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = divisor === 1_000_000 ? 'M' : 'K';
  const scaled = lot / divisor;
  const digits = scaled >= 100 ? 0 : 1;
  return `${scaled.toFixed(digits).replace('.', ',').replace(',0', '')}${suffix}`;
}

function formatSimTime(simTime) {
  const totalSeconds = Math.max(0, Math.floor((Number(simTime) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function ArenaInsights({ insights }) {
  const entries = Array.isArray(insights) ? insights.slice(0, 5) : [];
  if (!entries.length) return null;

  return (
    <section className="arena-insights" aria-label="Market Insight simulasi">
      <div className="arena-insights-head">
        <div>
          <strong>Market Insight</strong>
          <span>Pola terdeteksi setelah event selesai</span>
        </div>
        <span>{entries.length}/5</span>
      </div>
      <div className="arena-insight-list">
        {entries.map((insight, index) => (
          <article
            key={insight.id == null ? `${insight.category}-${index}` : insight.id}
            className={`arena-insight arena-insight-${insight.category || 'market'}`}
          >
            <span>{formatSimTime(insight.simTime)}</span>
            <p>{insight.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ArenaLadder({ snap, onPick, onPlace, onMove, onWithdraw, orders, ticker }) {
  const previousDepth = useRefAA({});
  const bodyRef = useRefAA(null);
  const lastRowRef = useRefAA(null);
  const centeredFor = useRefAA(null);
  const manualScrollUntil = useRefAA(0);
  const dragStartPrice = useRefAA(null);
  const onMoveRef = useRefAA(onMove);
  onMoveRef.current = onMove;
  const [draggedOrderId, setDraggedOrderId] = useStateAA(null);
  const [dropPrice, setDropPrice] = useStateAA(null);

  useEffectAA(() => {
    if (!snap) return;
    const next = {};
    [...snap.depth.bids, ...snap.depth.asks].forEach((level) => {
      next[level.price] = level.lot;
    });
    previousDepth.current = next;
  }, [snap]);

  // Keep the active market near the viewport center. Manual scrolling pauses
  // auto-follow briefly so users can inspect distant price levels.
  useEffectAA(() => {
    if (!snap) return;
    const body = bodyRef.current;
    const row = lastRowRef.current;
    if (!body || !row) return;

    const tickerChanged = centeredFor.current !== ticker;
    if (!tickerChanged && Date.now() < manualScrollUntil.current) return;

    const bodyRect = body.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const rowCenter = rowRect.top + rowRect.height / 2;
    const safeTop = bodyRect.top + bodyRect.height * 0.35;
    const safeBottom = bodyRect.top + bodyRect.height * 0.65;
    if (tickerChanged || rowCenter < safeTop || rowCenter > safeBottom) {
      const rowCenterInBody = body.scrollTop + rowCenter - bodyRect.top;
      body.scrollTop = rowCenterInBody - body.clientHeight / 2;
    }
    centeredFor.current = ticker;
  }, [snap && snap.last, ticker]);

  // Pointer-based drag for moving a resting order to another price. Native
  // HTML5 drag-and-drop is cancelled by the live order book re-rendering every
  // tick, so we track the pointer on document and resolve the drop row via
  // elementFromPoint, which survives re-renders.
  useEffectAA(() => {
    if (draggedOrderId == null) return undefined;

    const priceUnder = (clientX, clientY) => {
      const element = document.elementFromPoint(clientX, clientY);
      const row = element && element.closest
        ? element.closest('.arena-price-row')
        : null;
      if (!row) return null;
      const value = Number(row.getAttribute('data-price'));
      return Number.isFinite(value) ? value : null;
    };

    let pointerX = null;
    let pointerY = null;
    let rafId = null;

    const track = (clientX, clientY) => {
      pointerX = clientX;
      pointerY = clientY;
      setDropPrice(priceUnder(clientX, clientY));
    };
    const finish = (clientX, clientY) => {
      const targetPrice = priceUnder(clientX, clientY);
      const orderId = draggedOrderId;
      const startPrice = dragStartPrice.current;
      setDraggedOrderId(null);
      setDropPrice(null);
      dragStartPrice.current = null;
      if (orderId != null && targetPrice != null && targetPrice !== startPrice) {
        onMoveRef.current(orderId, targetPrice);
      }
    };

    // Auto-scroll the ladder when the pointer nears its top/bottom edge so the
    // order can be dragged to any price across the full ARA->ARB range, even
    // rows that are off-screen.
    const EDGE = 52;
    const MAX_SPEED = 16;
    const autoScroll = () => {
      const body = bodyRef.current;
      if (body && pointerY != null) {
        const rect = body.getBoundingClientRect();
        if (pointerY < rect.top + EDGE) {
          const intensity = (rect.top + EDGE - pointerY) / EDGE;
          body.scrollTop -= MAX_SPEED * Math.min(1, intensity);
          if (pointerX != null) setDropPrice(priceUnder(pointerX, pointerY));
        } else if (pointerY > rect.bottom - EDGE) {
          const intensity = (pointerY - (rect.bottom - EDGE)) / EDGE;
          body.scrollTop += MAX_SPEED * Math.min(1, intensity);
          if (pointerX != null) setDropPrice(priceUnder(pointerX, pointerY));
        }
      }
      rafId = requestAnimationFrame(autoScroll);
    };

    const onMouseMove = (event) => track(event.clientX, event.clientY);
    const onMouseUp = (event) => finish(event.clientX, event.clientY);
    const onTouchMove = (event) => {
      const touch = event.touches[0];
      if (touch) {
        event.preventDefault();
        track(touch.clientX, touch.clientY);
      }
    };
    const onTouchEnd = (event) => {
      const touch = event.changedTouches[0];
      finish(touch ? touch.clientX : 0, touch ? touch.clientY : 0);
    };

    // Pause auto-follow re-centering while dragging so the ladder stays put.
    manualScrollUntil.current = Date.now() + 60_000;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.body.style.userSelect = 'none';
    rafId = requestAnimationFrame(autoScroll);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.body.style.userSelect = '';
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [draggedOrderId]);

  if (!snap) {
    return (
      <div className="arena-book arena-ladder-skel" aria-label="Memuat order book">
        <div className="arena-book-loading">Menyiapkan market simulator...</div>
      </div>
    );
  }

  const { tick, last } = snap;
  const stats = snap.stats || {};
  const done = snap.done || {};
  const doneBuy = snap.doneBuy || {};
  const doneSell = snap.doneSell || {};
  const previous = previousDepth.current;
  const askMap = {};
  const bidMap = {};

  snap.depth.asks.forEach((level) => { askMap[level.price] = level; });
  snap.depth.bids.forEach((level) => { bidMap[level.price] = level; });

  const myBuy = {};
  const mySell = {};
  (orders || []).forEach((order) => {
    const target = order.side === 'buy' ? myBuy : mySell;
    if (!target[order.price]) target[order.price] = [];
    target[order.price].push(order);
  });

  // Start dragging a resting order. Bound to both the order chip and the whole
  // lot cell that holds it, so the order can be grabbed from anywhere in the
  // highlighted box, not just the small chip.
  const beginOrderDrag = (order, event) => {
    if (!order) return;
    event.stopPropagation();
    if (event.type === 'mousedown' && event.cancelable) event.preventDefault();
    dragStartPrice.current = order.price;
    setDraggedOrderId(order.id);
    setDropPrice(order.price);
  };

  const renderOrderChip = (order) => (
    <i
      key={order.id}
      className={`arena-mine${draggedOrderId === order.id ? ' arena-mine-dragging' : ''}`}
      title={`Tarik ke harga lain untuk memindahkan order ${order.side}: ${order.lot} lot @ ${order.price}`}
      data-order-id={order.id}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => beginOrderDrag(order, event)}
      onTouchStart={(event) => beginOrderDrag(order, event)}
    >
      {order.lot}
    </i>
  );

  // Fixed range from ARA (top) down to ARB (bottom) — constant for the session, so
  // scroll position stays put and Done/lot update in place instead of shifting on ticks.
  const rows = buildArenaPriceRows(
    stats.ara || (last + 15 * tick),
    stats.arb || Math.max(50, last - 15 * tick),
    240,
  );

  const maxLot = Math.max(
    1,
    ...snap.depth.bids.map((level) => level.lot),
    ...snap.depth.asks.map((level) => level.lot),
  );
  const percentOf = (price) => (
    stats.prevClose ? ((price - stats.prevClose) / stats.prevClose) * 100 : 0
  );
  const marker = (price) => (
    price === stats.high ? 'H' : price === stats.open ? 'O' : price === stats.low ? 'L' : ''
  );
  const deltaClass = (price, lot) => {
    const previousLot = previous[price];
    if (previousLot == null) return '';
    return lot > previousLot ? ' d-up' : lot < previousLot ? ' d-dn' : '';
  };
  const deltaArrow = (price, lot) => {
    const previousLot = previous[price];
    if (previousLot == null || lot == null) return { glyph: '', cls: '' };
    if (lot > previousLot) return { glyph: '▲', cls: ' delta-up' };
    if (lot < previousLot) return { glyph: '▼', cls: ' delta-dn' };
    return { glyph: '', cls: '' };
  };

  const totalBidLot = snap.depth.bids.reduce((sum, level) => sum + level.lot, 0);
  const totalAskLot = snap.depth.asks.reduce((sum, level) => sum + level.lot, 0);
  const totalBidFreq = snap.depth.bids.reduce(
    (sum, level) => sum + arenaSyntheticFreq(level.lot, level.price),
    0,
  );
  const totalAskFreq = snap.depth.asks.reduce(
    (sum, level) => sum + arenaSyntheticFreq(level.lot, level.price),
    0,
  );

  // Build a contiguous trade-pressure band: every tick inside the traded
  // range gets a buy/sell split bar (carried from the nearest real print)
  // so the Trade column reads as one solid block instead of scattered bars.
  const tradedPrices = rows.filter((price) => (done[price] || 0) > 0);
  const bandHi = tradedPrices.length ? Math.max(...tradedPrices) : null;
  const bandLo = tradedPrices.length ? Math.min(...tradedPrices) : null;
  const tradeBand = {};
  let tradeCarry = null;
  rows.forEach((price) => {
    const buy = doneBuy[price] || 0;
    const sell = doneSell[price] || 0;
    const total = buy + sell;
    if (total > 0) {
      tradeCarry = { buy, sell, total };
      tradeBand[price] = { ...tradeCarry, real: true };
    } else if (bandHi != null && price <= bandHi && price >= bandLo && tradeCarry) {
      tradeBand[price] = { ...tradeCarry, real: false };
    }
  });

  return (
    <section className="arena-book arena-book-term" aria-label="Order book simulator">
      <div className="arena-book-titlebar">
        <div>
          <strong>Order Book</strong>
          <span>Depth sintetis dari aktivitas bot</span>
        </div>
        <span className="arena-live-dot">SIM LIVE</span>
      </div>

      <div className="arena-brow arena-bhead">
        <span>Trade</span>
        <span>Buy</span>
        <span>Freq</span>
        <span>+/-</span>
        <span>Lot</span>
        <span>Price</span>
        <span>Lot</span>
        <span>+/-</span>
        <span>Freq</span>
        <span>Sell</span>
        <span>Done</span>
      </div>

      <div
        className="arena-bbody"
        ref={bodyRef}
        onWheel={() => { manualScrollUntil.current = Date.now() + 8000; }}
        onTouchStart={() => { manualScrollUntil.current = Date.now() + 8000; }}
      >
        {rows.map((price) => {
          const ask = askMap[price];
          const bid = bidMap[price];
          const percent = percentOf(price);
          const priceMarker = marker(price);
          const priceState = percent > 0 ? ' paper-up' : percent < 0 ? ' paper-dn' : '';
          const band = tradeBand[price];
          const buyLot = band ? band.buy : 0;
          const sellLot = band ? band.sell : 0;
          const tradeTotal = band ? band.total : 0;
          const tradeReal = band ? band.real : false;
          const buyPct = tradeTotal ? Math.round((buyLot / tradeTotal) * 100) : 0;
          const sellPct = tradeTotal ? 100 - buyPct : 0;
          const bidDelta = bid ? deltaArrow(price, bid.lot) : { glyph: '', cls: '' };
          const askDelta = ask ? deltaArrow(price, ask.lot) : { glyph: '', cls: '' };

          return (
            <div
              key={price}
              ref={price === last ? lastRowRef : null}
              className={`arena-brow arena-price-row${price === last ? ' arena-brow-last' : ''}${dropPrice === price ? ' arena-row-drop-target' : ''}`}
              onClick={() => { if (draggedOrderId == null) onPick(price); }}
              data-price={price}
            >
              <span
                className={`arena-c-trade${tradeReal ? '' : ' arena-c-trade-carry'}`}
                title={tradeReal
                  ? `Buy ${buyLot.toLocaleString('id-ID')} lot (${buyPct}%) · Sell ${sellLot.toLocaleString('id-ID')} lot (${sellPct}%)`
                  : ''}
              >
                {tradeTotal > 0 && (
                  <>
                    <span className="arena-tbar-split" aria-hidden="true">
                      <span className="arena-tbar-buy" style={{ width: `${buyPct}%` }} />
                      <span className="arena-tbar-sell" style={{ width: `${sellPct}%` }} />
                    </span>
                    {tradeReal && <em>{arenaCompactLot(tradeTotal)}</em>}
                  </>
                )}
              </span>
              <span className="arena-c-act">
                <button
                  type="button"
                  className="arena-plus arena-plus-buy"
                  onClick={(event) => { event.stopPropagation(); onPlace('buy', price); }}
                  aria-label={`Pasang beli di ${price.toLocaleString('id-ID')}`}
                >
                  +
                </button>
              </span>
              <span className="arena-c-freq">{bid ? arenaSyntheticFreq(bid.lot, price) : ''}</span>
              <span className={`arena-c-delta${bidDelta.cls}`}>{bidDelta.glyph}</span>
              <span
                className={`arena-c-blot${myBuy[price] ? ' arena-c-mine' : ''}`}
                onMouseDown={myBuy[price] ? (event) => beginOrderDrag(myBuy[price][0], event) : undefined}
                onTouchStart={myBuy[price] ? (event) => beginOrderDrag(myBuy[price][0], event) : undefined}
              >
                {bid && (
                  <em
                    className={`arena-lotn${deltaClass(price, bid.lot)}`}
                    title={`${bid.lot.toLocaleString('id-ID')} lot`}
                  >
                    {arenaCompactLot(bid.lot)}
                  </em>
                )}
                {(myBuy[price] || []).map(renderOrderChip)}
              </span>
              <span className={`arena-c-px${priceState}`}>
                <span className="arena-price-main">
                  {priceMarker && <i className="arena-mk">{priceMarker}</i>}
                  {price.toLocaleString('id-ID')}
                </span>
                <small>{fmt.pct(percent)}</small>
              </span>
              <span
                className={`arena-c-alot${mySell[price] ? ' arena-c-mine' : ''}`}
                onMouseDown={mySell[price] ? (event) => beginOrderDrag(mySell[price][0], event) : undefined}
                onTouchStart={mySell[price] ? (event) => beginOrderDrag(mySell[price][0], event) : undefined}
              >
                {(mySell[price] || []).map(renderOrderChip)}
                {ask && (
                  <em
                    className={`arena-lotn${deltaClass(price, ask.lot)}`}
                    title={`${ask.lot.toLocaleString('id-ID')} lot`}
                  >
                    {arenaCompactLot(ask.lot)}
                  </em>
                )}
              </span>
              <span className={`arena-c-delta${askDelta.cls}`}>{askDelta.glyph}</span>
              <span className="arena-c-freq">{ask ? arenaSyntheticFreq(ask.lot, price) : ''}</span>
              <span className="arena-c-act">
                <button
                  type="button"
                  className="arena-plus arena-plus-sell"
                  onClick={(event) => { event.stopPropagation(); onPlace('sell', price); }}
                  aria-label={`Pasang jual di ${price.toLocaleString('id-ID')}`}
                >
                  +
                </button>
              </span>
              <span className={`arena-c-done${priceState}`}>
                {done[price] ? done[price].toLocaleString('id-ID') : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="arena-brow arena-btot">
        <span />
        <span />
        <span>{totalBidFreq}</span>
        <span />
        <span>{totalBidLot.toLocaleString('id-ID')}</span>
        <span>Total</span>
        <span>{totalAskLot.toLocaleString('id-ID')}</span>
        <span />
        <span>{totalAskFreq}</span>
        <span />
        <span />
      </div>

      <div className="arena-book-actions">
        <button type="button" className="arena-wd-buy" onClick={() => onWithdraw && onWithdraw('buy')}>
          Batalkan semua beli
        </button>
        <button type="button" className="arena-wd-all" onClick={() => onWithdraw && onWithdraw()}>
          Batalkan semua
        </button>
        <button type="button" className="arena-wd-sell" onClick={() => onWithdraw && onWithdraw('sell')}>
          Batalkan semua jual
        </button>
      </div>
    </section>
  );
}

function ArenaPage() {
  const account = useArena();
  const marketRef = useRefAA(null);
  const messageTimer = useRefAA(null);
  const searchTimer = useRefAA(null);
  const [snap, setSnap] = useStateAA(null);
  const [seedPrice, setSeedPrice] = useStateAA(null);
  const [mode, setMode] = useStateAA('limit');
  const [lot, setLot] = useStateAA('5');
  const [price, setPrice] = useStateAA('');
  const [orders, setOrders] = useStateAA([]);
  const [message, setMessage] = useStateAA(null);
  const [query, setQuery] = useStateAA('');
  const [results, setResults] = useStateAA([]);
  const [tape, setTape] = useStateAA([]);
  const tapeRef = useRefAA([]);
  const tapeSeq = useRefAA(0);

  const ticker = account.ticker;
  const marketProfile = account.market?.profile || 'normal';
  const marketSpeed = account.market?.speed || 1;

  useEffectAA(() => {
    if (!ticker) {
      setSnap(null);
      return undefined;
    }

    let disposed = false;
    tapeRef.current = [];
    setTape([]);

    fetch('/price?ticker=' + ticker)
      .then((response) => response.json())
      .then((data) => {
        if (disposed) return;
        const startingPrice = data.price || 1000;
        setSeedPrice(startingPrice);

        const market = createMarket({
          seedPrice: startingPrice,
          profile: marketProfile,
          speed: marketSpeed,
          onUpdate: () => {
            if (disposed) return;
            setSnap(market.snapshot());
            setOrders(market.userOrders());
            setTape(tapeRef.current.slice(0, 30));
          },
          onTrade: (trade) => {
            if (trade.buyOwner === 'user' || trade.sellOwner === 'user') {
              applyUserFills([trade]);
            }
            const previous = tapeRef.current[0];
            const direction = previous
              ? (trade.price > previous.price ? 'up' : trade.price < previous.price ? 'dn' : previous.direction || '')
              : '';
            const mine = trade.buyOwner === 'user' || trade.sellOwner === 'user';
            tapeRef.current.unshift({ price: trade.price, lot: trade.lot, direction, mine, id: ++tapeSeq.current });
            if (tapeRef.current.length > 40) tapeRef.current.length = 40;
          },
        });

        marketRef.current = market;
        const firstSnapshot = market.snapshot();
        setSnap(firstSnapshot);
        setPrice(String(firstSnapshot.last));
        market.start();
      })
      .catch(() => {
        if (!disposed) setMessage('Harga awal gagal dimuat. Coba pilih saham lagi.');
      });

    return () => {
      disposed = true;
      if (marketRef.current) marketRef.current.stop();
      marketRef.current = null;
    };
  }, [ticker, marketProfile]);

  useEffectAA(() => {
    if (marketRef.current) marketRef.current.setSpeed(marketSpeed);
  }, [marketSpeed]);

  useEffectAA(() => () => {
    clearTimeout(messageTimer.current);
    clearTimeout(searchTimer.current);
  }, []);

  const position = account.position || { lot: 0, avg: 0 };
  const last = snap ? snap.last : (seedPrice || 0);
  const portfolioValue = position.lot * 100 * last;
  const equity = account.cash + portfolioValue;
  const unrealized = position.lot > 0 ? (last - position.avg) * position.lot * 100 : 0;
  const unrealizedPercent = position.lot > 0 && position.avg > 0
    ? ((last - position.avg) / position.avg) * 100
    : 0;
  const changeAmount = seedPrice ? last - seedPrice : 0;
  const changePercent = seedPrice ? (changeAmount / seedPrice) * 100 : 0;
  const buyFeeRate = account.feeOn ? AR_FEE_BUY : 0;
  const reservedBuyCash = calculateArenaReservedCash({
    orders,
    feeRate: buyFeeRate,
  });
  const availableBuyingPower = Math.max(0, account.cash - reservedBuyCash);

  const showMessage = (text) => {
    clearTimeout(messageTimer.current);
    setMessage(text);
    messageTimer.current = setTimeout(() => setMessage(null), 4500);
  };

  // Core: place an order. orderPrice === null → market; otherwise limit at that price.
  const executeOrder = (side, orderPrice) => {
    const market = marketRef.current;
    if (!market) return;

    const orderLot = Math.floor(Number(lot)) || 0;
    const finalOrderPrice = orderPrice == null
      ? null
      : market.normalizeLimitPrice(orderPrice);
    if (orderLot <= 0) { showMessage('Lot tidak valid'); return; }
    if (finalOrderPrice != null && !(finalOrderPrice > 0)) {
      showMessage('Harga tidak valid');
      return;
    }
    if (side === 'sell' && orderLot > position.lot) { showMessage('Lot melebihi posisi'); return; }

    if (side === 'buy') {
      const reference = finalOrderPrice || snap.bestAsk || last;
      const estimate = calculateArenaEstimate({
        side: 'buy',
        lot: orderLot,
        price: reference,
        feeRate: buyFeeRate,
      });
      if (estimate.total > availableBuyingPower) {
        showMessage('Buying power tidak cukup. Batalkan open buy order atau kurangi lot.');
        return;
      }
    }

    const result = market.submitUser({
      side,
      price: finalOrderPrice,
      lot: orderLot,
    });
    setSnap(market.snapshot());
    setOrders(market.userOrders());

    const filled = result.trades.reduce((sum, trade) => sum + trade.lot, 0);
    const action = side === 'buy' ? 'Beli' : 'Jual';
    const at = finalOrderPrice != null
      ? ` @ ${finalOrderPrice.toLocaleString('id-ID')}`
      : '';
    if (filled && result.restingLot) showMessage(`${action}: fill ${filled} lot, ${result.restingLot} lot mengantre${at}`);
    else if (filled) showMessage(`${action}: fill ${filled} lot`);
    else if (result.restingLot) showMessage(`${action} ${result.restingLot} lot mengantre${at}`);
    else showMessage('Belum ada order yang match');
  };

  // Ticket button: resolve price from limit/market mode.
  const placeOrder = (side) => {
    const market = marketRef.current;
    if (!market) return;
    executeOrder(
      side,
      mode === 'market' ? null : normalizeArenaOrderPrice(Number(price)),
    );
  };

  // Ladder + button: place a limit order directly at the clicked price.
  const placeAt = (side, atPrice) => {
    const market = marketRef.current;
    if (!market) return;
    const p = normalizeArenaOrderPrice(atPrice);
    setMode('limit');
    setPrice(String(p));
    executeOrder(side, p);
  };

  const moveOrder = (orderId, targetPrice) => {
    const market = marketRef.current;
    if (!market) return;

    const activeOrders = market.userOrders();
    const order = activeOrders.find((item) => item.id === orderId);
    if (!order) {
      showMessage('Order sudah tidak aktif');
      return;
    }

    const nextPrice = market.normalizeLimitPrice(Number(targetPrice));
    if (!(nextPrice > 0) || nextPrice === order.price) {
      if (nextPrice === order.price) showMessage('Order tetap di harga yang sama');
      return;
    }

    if (order.side === 'buy') {
      const reservedOtherOrders = calculateArenaReservedCash({
        orders: activeOrders,
        feeRate: buyFeeRate,
        excludeOrderId: order.id,
      });
      const buyingPowerForMove = Math.max(0, account.cash - reservedOtherOrders);
      const movedEstimate = calculateArenaEstimate({
        side: 'buy',
        lot: order.lot,
        price: nextPrice,
        feeRate: buyFeeRate,
      });

      if (movedEstimate.total > buyingPowerForMove) {
        showMessage('Harga tujuan melebihi buying power. Order lama tetap aktif.');
        return;
      }
    }

    if (!market.cancel(order.id)) {
      showMessage('Order gagal dipindahkan karena sudah tidak aktif');
      return;
    }

    const result = market.submitUser({
      side: order.side,
      price: nextPrice,
      lot: order.lot,
    });
    setSnap(market.snapshot());
    setOrders(market.userOrders());

    const filled = result.trades.reduce((sum, trade) => sum + trade.lot, 0);
    const sideLabel = order.side === 'buy' ? 'BUY' : 'SELL';
    const moveLabel = `${sideLabel} ${order.lot} lot ${order.price.toLocaleString('id-ID')} -> ${nextPrice.toLocaleString('id-ID')}`;
    if (filled && result.restingLot) {
      showMessage(`${moveLabel}: fill ${filled}, ${result.restingLot} lot mengantre`);
    } else if (filled) {
      showMessage(`${moveLabel}: seluruhnya terisi`);
    } else {
      showMessage(`${moveLabel}: order dipindahkan`);
    }
  };

  const cancelOrder = (id) => {
    const market = marketRef.current;
    if (!market) return;
    market.cancel(id);
    setOrders(market.userOrders());
  };

  const onSearch = (value) => {
    setQuery(value);
    clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    searchTimer.current = setTimeout(() => {
      fetch('/search?q=' + encodeURIComponent(value.trim()))
        .then((response) => response.json())
        .then((data) => setResults((data.results || []).slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
  };

  const pickTicker = (symbol) => {
    setQuery('');
    setResults([]);
    setArenaTicker(String(symbol).toUpperCase());
  };

  const resetAccount = () => {
    const value = window.prompt('Reset Arena. Modal awal (Rp):', String(account.initial));
    if (value == null) return;
    const modal = Number(String(value).replace(/[^\d]/g, '')) || AR_DEFAULT_MODAL;
    resetArena(modal, ticker);
  };

  const lotNumber = Math.max(0, Math.floor(Number(lot)) || 0);
  const priceNumber = Math.max(0, Number(price) || 0);
  const activeMarket = marketRef.current;
  const rawLimitReference = priceNumber || last;
  const normalizedLimitReference = activeMarket
    ? activeMarket.normalizeLimitPrice(rawLimitReference)
    : normalizeArenaOrderPrice(rawLimitReference);
  const buyReference = mode === 'market'
    ? ((snap && snap.bestAsk) || last)
    : normalizedLimitReference;
  const sellReference = mode === 'market'
    ? ((snap && snap.bestBid) || last)
    : normalizedLimitReference;
  const allocationPrice = buyReference || last || 0;
  const maxBuy = calculateArenaAllocation({
    cash: availableBuyingPower,
    price: allocationPrice,
    feeRate: buyFeeRate,
    fraction: 1,
  });
  const buyEstimate = calculateArenaEstimate({
    side: 'buy',
    lot: lotNumber,
    price: buyReference,
    feeRate: buyFeeRate,
  });
  const sellEstimate = calculateArenaEstimate({
    side: 'sell',
    lot: lotNumber,
    price: sellReference,
    feeRate: account.feeOn ? AR_FEE_SELL : 0,
  });

  const stepLot = (delta) => setLot(String(Math.max(1, lotNumber + delta)));
  const stepPrice = (delta) => {
    const nextPrice = delta < 0
      ? previousArenaPrice(priceNumber)
      : nextArenaPrice(priceNumber);
    setPrice(String(nextPrice));
  };
  const setAllocation = (fraction) => {
    const allocatedLot = calculateArenaAllocation({
      cash: availableBuyingPower,
      price: allocationPrice,
      feeRate: buyFeeRate,
      fraction,
    });
    if (allocatedLot > 0) setLot(String(allocatedLot));
    else showMessage('Buying power belum cukup untuk 1 lot');
  };
  const withdrawAll = (side) => {
    const market = marketRef.current;
    if (!market) return;
    market.userOrders().forEach((order) => {
      if (!side || order.side === side) market.cancel(order.id);
    });
    setOrders(market.userOrders());
  };
  const changeProfile = (nextProfile) => {
    if (nextProfile === marketProfile) return;
    if (orders.length > 0) {
      const confirmed = window.confirm(
        'Ganti profil akan membatalkan seluruh open order Arena. Lanjutkan?',
      );
      if (!confirmed) return;
    }
    withdrawAll();
    setArenaMarketPreferences({ profile: nextProfile });
  };
  const changeSpeed = (speed) => {
    setArenaMarketPreferences({ speed });
  };

  return (
    <CalcScreen
      className="arena-screen"
      title="Arena FO melawan bot."
      subtitle="Latihan membaca order book dan mengeksekusi limit atau market order. Harga setelah market dimulai bersifat sintetis, bukan transaksi bursa nyata."
    >
      <div className="arena-account-summary">
        <div className="arena-account-card">
          <span>Buying Power</span>
          <strong>{arShort(availableBuyingPower)}</strong>
          <small>
            {reservedBuyCash > 0
              ? `${arShort(reservedBuyCash)} dicadangkan untuk open buy`
              : 'Cash tersedia'}
          </small>
        </div>
        <div className="arena-account-card">
          <span>Portfolio Value</span>
          <strong>{arShort(portfolioValue)}</strong>
          <small>Equity {arShort(equity)}</small>
        </div>
        <div className="arena-account-card">
          <span>Unrealized P&amp;L</span>
          <strong className={unrealized >= 0 ? 'paper-up' : 'paper-dn'}>
            {unrealized >= 0 ? '+' : ''}{arShort(unrealized)}
          </strong>
          <small className={unrealizedPercent >= 0 ? 'paper-up' : 'paper-dn'}>
            {fmt.pct(unrealizedPercent)}
          </small>
        </div>
        <div className="arena-account-actions">
          <label className="paper-fee-toggle">
            <input
              type="checkbox"
              checked={account.feeOn}
              onChange={(event) => setArenaFee(event.target.checked)}
            />
            <span>Fee broker</span>
          </label>
          <button type="button" className="btn btn-secondary paper-reset" onClick={resetAccount}>
            Reset
          </button>
        </div>
      </div>

      {!ticker ? (
        <div className="watchlist-search arena-pick">
          <input
            className="watchlist-search-input"
            placeholder="Cari saham untuk masuk Arena..."
            value={query}
            onChange={(event) => onSearch(event.target.value)}
            aria-label="Cari saham Arena"
          />
          {results.length > 0 && (
            <div className="watchlist-search-results">
              {results.map((result) => (
                <button
                  type="button"
                  key={result.symbol}
                  className="watchlist-search-item"
                  onClick={() => pickTicker(result.symbol)}
                >
                  <strong>{result.symbol}</strong>
                  <span>{result.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <section className="arena-market-shell">
            <div className="arena-head">
              <div className="arena-head-main">
                <div className="arena-symbol-lockup">
                  <span className="arena-symbol-logo">{ticker.slice(0, 2)}</span>
                  <div>
                    <div className="arena-head-tk">
                      <strong>{ticker}</strong>
                      <span className="arena-sim-badge">MARKET SIM</span>
                    </div>
                    <span className="arena-head-caption">Synthetic order book</span>
                  </div>
                </div>
                <div className="arena-quote">
                  <span className="arena-head-last">
                    {last ? last.toLocaleString('id-ID') : '...'}
                  </span>
                  <span className={changePercent >= 0 ? 'paper-up' : 'paper-dn'}>
                    {changeAmount >= 0 ? '+' : ''}{changeAmount.toLocaleString('id-ID')}
                    {' '}({fmt.pct(changePercent)})
                  </span>
                </div>
              </div>
              <button type="button" className="arena-change" onClick={() => setArenaTicker(null)}>
                Ganti saham
              </button>
            </div>

            <div className="arena-sim-controls" aria-label="Kontrol simulasi market">
              <div className="arena-control-group">
                <span>Profil market</span>
                <div className="arena-mini-seg arena-profile-options">
                  {Object.values(ARENA_PROFILES).map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={marketProfile === profile.id ? 'on' : ''}
                      onClick={() => changeProfile(profile.id)}
                      data-arena-profile={profile.id}
                      aria-pressed={marketProfile === profile.id}
                    >
                      {profile.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="arena-control-group arena-speed-control">
                <span>Speed</span>
                <div className="arena-mini-seg">
                  {ARENA_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      className={marketSpeed === speed ? 'on' : ''}
                      onClick={() => changeSpeed(speed)}
                      data-arena-speed={speed}
                      aria-pressed={marketSpeed === speed}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="arena-regime-wrap">
                <span>Regime</span>
                <strong
                  className={`arena-regime arena-regime-${snap?.regime?.id || 'normal'}`}
                  data-arena-regime={snap?.regime?.id || 'normal'}
                >
                  <i aria-hidden="true" />
                  {snap?.regime?.label || 'Normal'}
                </strong>
              </div>
            </div>

            {snap && snap.stats && (
              <div className="arena-stats">
                <div><span>Volume</span><b>{snap.stats.vol.toLocaleString('id-ID')} lot</b></div>
                <div><span>Value</span><b>{arShort(snap.stats.val)}</b></div>
                <div><span>Frequency</span><b>{snap.stats.freq.toLocaleString('id-ID')}</b></div>
                <div><span>Average</span><b>{snap.stats.avg.toLocaleString('id-ID')}</b></div>
                <div><span>ARA</span><b className="paper-up">{snap.stats.ara.toLocaleString('id-ID')}</b></div>
                <div><span>ARB</span><b className="paper-dn">{snap.stats.arb.toLocaleString('id-ID')}</b></div>
              </div>
            )}

            {position.lot > 0 && (
              <div className="arena-pos">
                <div>
                  <span>Posisi aktif</span>
                  <strong>{position.lot} lot @ {arRp(position.avg)}</strong>
                </div>
                <div className={unrealized >= 0 ? 'paper-up' : 'paper-dn'}>
                  <strong>{unrealized >= 0 ? '+' : ''}{arRp(unrealized)}</strong>
                  <span>{fmt.pct(unrealizedPercent)}</span>
                </div>
              </div>
            )}
          </section>

          <div className="arena-main">
            <ArenaLadder
              snap={snap}
              ticker={ticker}
              orders={orders}
              onPlace={placeAt}
              onMove={moveOrder}
              onWithdraw={withdrawAll}
              onPick={(selectedPrice) => {
                setMode('limit');
                setPrice(String(selectedPrice));
              }}
            />

            <section className="arena-tape" aria-label="Running trade">
              <div className="arena-tape-titlebar">
                <strong>Running Trade</strong>
                <span className="arena-live-dot">LIVE</span>
              </div>
              <div className="arena-tape-head">
                <span>Price</span>
                <span>Lot</span>
              </div>
              <div className="arena-tape-list">
                {tape.length === 0 && (
                  <div className="arena-tape-empty">Menunggu transaksi…</div>
                )}
                {tape.map((row) => (
                  <div
                    key={row.id}
                    className={`arena-tape-row arena-tape-${row.direction || 'flat'}${row.mine ? ' arena-tape-mine' : ''}`}
                  >
                    <span className="arena-tape-px">
                      <i className="arena-tape-arrow">
                        {row.direction === 'up' ? '▲' : row.direction === 'dn' ? '▼' : '·'}
                      </i>
                      {row.price.toLocaleString('id-ID')}
                    </span>
                    <span className="arena-tape-lot">
                      {row.lot.toLocaleString('id-ID')}
                      {row.mine && <em className="arena-tape-badge">kamu</em>}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <aside className="arena-ticket-wrap">
              <div className="arena-ticket">
                <div className="arena-ticket-heading">
                  <div>
                    <strong>Order Ticket</strong>
                    <span>{ticker} - {mode === 'limit' ? 'Limit order' : 'Market order'}</span>
                  </div>
                  <span className="arena-ticket-status">SIMULASI</span>
                </div>

                <div className="arena-seg" role="tablist" aria-label="Jenis order">
                  <button
                    type="button"
                    className={mode === 'limit' ? 'on' : ''}
                    onClick={() => setMode('limit')}
                    role="tab"
                    aria-selected={mode === 'limit'}
                  >
                    Limit
                  </button>
                  <button
                    type="button"
                    className={mode === 'market' ? 'on' : ''}
                    onClick={() => setMode('market')}
                    role="tab"
                    aria-selected={mode === 'market'}
                  >
                    Market
                  </button>
                </div>

                {mode === 'limit' && (
                  <div className="arena-step">
                    <span className="arena-step-lbl">Price</span>
                    <button type="button" onClick={() => stepPrice(-1)} aria-label="Kurangi harga">-</button>
                    <input
                      type="number"
                      aria-label="Harga order"
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                    />
                    <button type="button" onClick={() => stepPrice(1)} aria-label="Tambah harga">+</button>
                  </div>
                )}

                <div className="arena-step">
                  <span className="arena-step-lbl">Lot</span>
                  <button type="button" onClick={() => stepLot(-1)} aria-label="Kurangi lot">-</button>
                  <input
                    type="number"
                    min="1"
                    aria-label="Jumlah lot"
                    value={lot}
                    onChange={(event) => setLot(event.target.value)}
                  />
                  <button type="button" onClick={() => stepLot(1)} aria-label="Tambah lot">+</button>
                </div>

                <div className="arena-allocation-label">
                  <span>Alokasi buying power</span>
                  <strong>Max {maxBuy.toLocaleString('id-ID')} lot</strong>
                </div>
                <div className="arena-presets">
                  {[
                    { label: '25%', value: 0.25 },
                    { label: '50%', value: 0.5 },
                    { label: '75%', value: 0.75 },
                    { label: 'MAX', value: 1 },
                  ].map((preset) => (
                    <button
                      type="button"
                      key={preset.label}
                      onClick={() => setAllocation(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="arena-estimate">
                  <div>
                    <span>Nilai transaksi</span>
                    <strong>{arRp(buyEstimate.gross)}</strong>
                  </div>
                  <div>
                    <span>Estimasi fee beli</span>
                    <b>{arRp(buyEstimate.fee)}</b>
                  </div>
                  <div>
                    <span>Estimasi fee jual</span>
                    <b>{arRp(sellEstimate.fee)}</b>
                  </div>
                </div>

                <div className="arena-maxrow">
                  <button
                    type="button"
                    className="arena-max"
                    onClick={() => maxBuy > 0 && setLot(String(maxBuy))}
                  >
                    Beli maksimal ({maxBuy.toLocaleString('id-ID')})
                  </button>
                  <button
                    type="button"
                    className="arena-max"
                    onClick={() => position.lot > 0 && setLot(String(position.lot))}
                  >
                    Jual maksimal ({position.lot.toLocaleString('id-ID')})
                  </button>
                </div>

                <div className="arena-btns">
                  <button type="button" className="btn btn-primary" onClick={() => placeOrder('buy')}>
                    BELI
                    <small>{arRp(buyEstimate.total)}</small>
                  </button>
                  <button type="button" className="btn btn-sell" onClick={() => placeOrder('sell')}>
                    JUAL
                    <small>{arRp(sellEstimate.total)}</small>
                  </button>
                </div>

                {message && <div className="arena-msg" role="status">{message}</div>}

                {orders.length > 0 && (
                  <div className="arena-orders">
                    <div className="arena-orders-h">
                      <span>Open orders ({orders.length})</span>
                      <div className="arena-wd">
                        <button type="button" onClick={() => withdrawAll('buy')}>Buy</button>
                        <button type="button" onClick={() => withdrawAll()}>All</button>
                        <button type="button" onClick={() => withdrawAll('sell')}>Sell</button>
                      </div>
                    </div>
                    {orders.map((order) => (
                      <div key={order.id} className="arena-order">
                        <span className={order.side === 'buy' ? 'paper-up' : 'paper-dn'}>
                          {order.side === 'buy' ? 'BUY' : 'SELL'}
                        </span>
                        <span className="arena-order-detail">
                          <b>{order.lot.toLocaleString('id-ID')} lot @ {order.price.toLocaleString('id-ID')}</b>
                          <small>
                            antrean depan {arenaCompactLot(order.aheadLot)} lot
                          </small>
                        </span>
                        <button
                          type="button"
                          onClick={() => cancelOrder(order.id)}
                          aria-label={`Batalkan order ${order.side}`}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </aside>
            </div>

            <ArenaInsights insights={snap?.insights} />

            {account.history.length > 0 && (
            <section className="arena-hist">
              <div className="arena-hist-title">
                <div>
                  <strong>Fill History</strong>
                  <span>12 transaksi terakhir</span>
                </div>
                <span>{account.history.length} fill</span>
              </div>
              <div className="arena-history-list">
                {account.history.slice(0, 12).map((entry, index) => (
                  <div key={`${entry.t}-${index}`} className="arena-history-row">
                    <span className={entry.type === 'BUY' ? 'paper-up' : 'paper-dn'}>
                      {entry.type}
                    </span>
                    <span>{entry.lot} lot</span>
                    <span>@ {arRp(entry.price)}</span>
                    <span>Fee {arRp(entry.fee)}</span>
                    <strong className={entry.realized >= 0 ? 'paper-up' : 'paper-dn'}>
                      {entry.type === 'SELL' && entry.realized != null
                        ? `${entry.realized >= 0 ? '+' : ''}${arRp(entry.realized)}`
                        : '-'}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </CalcScreen>
  );
}

Object.assign(window, { ArenaPage });
