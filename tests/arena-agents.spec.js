const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCreateBook() {
  const filename = path.join(__dirname, '..', 'js', 'cuanmeter', 'arena-engine.js');
  const source = fs.readFileSync(filename, 'utf8');
  const context = vm.createContext({});

  vm.runInContext(source, context, { filename });

  return context.createBook;
}

const createBook = loadCreateBook();
const localize = (value) => JSON.parse(JSON.stringify(value));

function loadArenaRuntime() {
  const base = path.join(__dirname, '..', 'js', 'cuanmeter');
  const files = [
    'arena-market.js',
    'arena-engine.js',
    'arena-agents.js',
    'arena-flow.js',
    'arena-bots.js',
  ];
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
  });
  context.window = context;

  for (const file of files) {
    const filename = path.join(base, file);
    const source = fs.existsSync(filename)
      ? fs.readFileSync(filename, 'utf8')
      : '';
    vm.runInContext(source, context, { filename });
  }

  return context;
}

function loadArenaStoreRuntime(initialValue) {
  const base = path.join(__dirname, '..', 'js', 'cuanmeter');
  const storage = new Map();
  if (initialValue !== undefined) {
    storage.set('cuanmeter:arena', JSON.stringify(initialValue));
  }
  const context = vm.createContext({
    console,
    React: {
      useState: () => [null, () => {}],
      useEffect: () => {},
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  });
  context.window = context;

  for (const file of ['arena-market.js', 'arena-store.jsx']) {
    const filename = path.join(base, file);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  return context;
}

function createFakeScheduler() {
  let nextId = 1;
  const pending = new Map();
  const scheduledDelays = [];
  const cancelled = [];

  return {
    schedule(callback, delay) {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      scheduledDelays.push(delay);
      return id;
    },
    cancelSchedule(id) {
      cancelled.push(id);
      pending.delete(id);
    },
    runNext() {
      const entry = pending.entries().next().value;
      if (!entry) return false;
      const [id, callback] = entry;
      pending.delete(id);
      callback();
      return true;
    },
    pending,
    scheduledDelays,
    cancelled,
  };
}

function createAgentHarness(runtime, { seed, profile }) {
  const rng = runtime.createArenaRng(seed);
  const book = createBook(1);
  book.last = 140;
  const insights = [];
  let nextEventId = 1;

  for (let level = 1; level <= 8; level += 1) {
    book.submit({
      side: 'buy',
      price: 140 - level,
      lot: 20 + level * 4,
      owner: `seed:bid:${level}`,
    });
    book.submit({
      side: 'sell',
      price: 140 + level,
      lot: 20 + level * 4,
      owner: `seed:ask:${level}`,
    });
  }

  const context = {
    book,
    rng,
    tick: 1,
    simNow: 0,
    profile: runtime.ARENA_PROFILES[profile],
    nextEventId: () => nextEventId++,
    pushInsight: (insight) => insights.unshift(insight),
    medianDepth(side) {
      const depth = book.depth(8);
      const levels = side === 'buy' ? depth.bids : depth.asks;
      return runtime.median(levels.map((level) => level.lot));
    },
    submitSynthetic(order) {
      return book.submit(order);
    },
  };

  return {
    book,
    context,
    insights,
    nearbyMedian: context.medianDepth,
    consumeOwnerOrder(owner) {
      const order = book.restingByOwner(owner)[0];
      if (!order) return;
      const requiredLot = book.restingOrders()
        .filter((candidate) => (
          order.side === 'sell'
            ? candidate.side === 'sell' && candidate.price <= order.price
            : candidate.side === 'buy' && candidate.price >= order.price
        ))
        .reduce((total, candidate) => total + candidate.lot, 0);
      book.submit({
        side: order.side === 'buy' ? 'sell' : 'buy',
        price: null,
        lot: requiredLot,
        owner: 'test-aggressor',
      });
    },
  };
}

function createFlowHarness(runtime, { seed = 101, profile = 'normal' } = {}) {
  const harness = createAgentHarness(runtime, { seed, profile });
  harness.context.regime = {
    id: 'normal',
    activity: 0.62,
    aggression: 0.42,
    bias: 0,
    spreadFactor: 1,
  };
  harness.context.getFairValue = () => 140;
  harness.context.roundPrice = (price) => Math.round(price);
  harness.context.passivePrice = (side) => (
    side === 'buy' ? harness.book.bestBid() : harness.book.bestAsk()
  );
  return harness;
}

function sampleMarket(runtime, {
  seed,
  profile,
  forcedRegime,
  steps = 1_200,
}) {
  const market = runtime.createMarket({
    seedPrice: 140,
    profile,
    seed,
    forcedRegime,
  });
  const samples = [];

  for (let index = 0; index < steps; index += 1) {
    const result = market.step(500);
    const snapshot = market.snapshot(12);
    const hasTwoSidedMarket = Number.isFinite(snapshot.bestBid)
      && Number.isFinite(snapshot.bestAsk);
    samples.push({
      tradeCount: result.tradeCount,
      last: snapshot.last,
      spread: hasTwoSidedMarket ? snapshot.bestAsk - snapshot.bestBid : null,
      bidLot: snapshot.depth.bids.reduce((sum, level) => sum + level.lot, 0),
      askLot: snapshot.depth.asks.reduce((sum, level) => sum + level.lot, 0),
    });
  }
  return samples;
}

function sumTrades(samples) {
  return samples.reduce((total, sample) => total + sample.tradeCount, 0);
}

function netPriceMove(samples) {
  return samples.at(-1).last - samples[0].last;
}

function averageDepth(samples) {
  return samples.reduce(
    (total, sample) => total + sample.bidLot + sample.askLot,
    0,
  ) / samples.length;
}

function averageSpread(samples) {
  const spreads = samples
    .map((sample) => sample.spread)
    .filter(Number.isFinite);
  return spreads.reduce((total, spread) => total + spread, 0)
    / Math.max(1, spreads.length);
}

function assertValidSyntheticState(runtime, market, seedPrice) {
  const snapshot = market.snapshot(50);
  const minimum = Math.max(50, seedPrice * 0.8, snapshot.stats.arb);
  const maximum = Math.min(seedPrice * 1.2, snapshot.stats.ara);
  const fairTick = runtime.tickSizeFor(snapshot.ref);

  assert.ok(snapshot.ref >= minimum, `${snapshot.ref} must be >= ${minimum}`);
  assert.ok(snapshot.ref <= maximum, `${snapshot.ref} must be <= ${maximum}`);
  assert.equal(snapshot.ref % fairTick, 0);
  assert.equal(snapshot.tick, fairTick);
  assert.equal(market.tick, fairTick);

  const syntheticOrders = market.book.restingOrders()
    .filter((order) => order.owner !== 'user');
  for (const order of syntheticOrders) {
    const orderTick = runtime.tickSizeFor(order.price);
    assert.ok(order.price >= minimum, `${order.price} must be >= ${minimum}`);
    assert.ok(order.price <= maximum, `${order.price} must be <= ${maximum}`);
    assert.equal(
      order.price % orderTick,
      0,
      `${order.price} must align to tick ${orderTick}`,
    );
  }
}

test('Arena price helpers normalize and traverse IDX tick boundaries', () => {
  const runtime = loadArenaRuntime();

  assert.equal(runtime.normalizeArenaOrderPrice(201), 202);
  assert.equal(runtime.normalizeArenaOrderPrice(499), 500);
  assert.equal(runtime.normalizeArenaOrderPrice(586, 'floor'), 585);
  assert.equal(runtime.normalizeArenaOrderPrice(397.8, 'ceil'), 398);
  assert.equal(runtime.normalizeArenaOrderPrice(1, 'floor'), 50);

  assert.equal(runtime.previousArenaPrice(500), 498);
  assert.equal(runtime.previousArenaPrice(200), 199);
  assert.equal(runtime.previousArenaPrice(5_000), 4_990);
  assert.equal(runtime.previousArenaPrice(50), 50);

  assert.equal(runtime.nextArenaPrice(199), 200);
  assert.equal(runtime.nextArenaPrice(498), 500);
  assert.equal(runtime.nextArenaPrice(4_990), 5_000);
});

test('buildArenaPriceRows returns descending unique valid prices across boundaries', () => {
  const runtime = loadArenaRuntime();
  const rows = localize(runtime.buildArenaPriceRows(586, 397.8, 240));

  assert.equal(rows[0], 585);
  assert.equal(rows.at(-1), 398);
  assert.ok(rows.includes(500));
  assert.ok(rows.includes(498));
  assert.equal(new Set(rows).size, rows.length);
  assert.ok(rows.every((price, index) => (
    price >= 50
    && price % runtime.tickSizeFor(price) === 0
    && (index === 0 || price < rows[index - 1])
  )));

  const limited = localize(runtime.buildArenaPriceRows(10_000, 50, 3));
  assert.equal(limited.length, 3);
});

test('Arena JSX uses price-specific helpers for ladder and order interactions', () => {
  const filename = path.join(__dirname, '..', 'js', 'cuanmeter', 'arena.jsx');
  const source = fs.readFileSync(filename, 'utf8');

  assert.match(source, /buildArenaPriceRows\(/);
  assert.match(source, /normalizeArenaOrderPrice\(Number\(price\)\)/);
  assert.match(source, /normalizeArenaOrderPrice\(atPrice\)/);
  assert.match(source, /market\.normalizeLimitPrice\(Number\(targetPrice\)\)/);
  assert.match(source, /previousArenaPrice\(priceNumber\)/);
  assert.match(source, /nextArenaPrice\(priceNumber\)/);
});

test('Arena JSX uses the final market limit price for estimates and submission', () => {
  const filename = path.join(__dirname, '..', 'js', 'cuanmeter', 'arena.jsx');
  const source = fs.readFileSync(filename, 'utf8');

  assert.match(
    source,
    /const finalOrderPrice = orderPrice == null[\s\S]*market\.normalizeLimitPrice\(orderPrice\)/,
  );
  assert.match(source, /price:\s*finalOrderPrice/);
  assert.match(
    source,
    /market\.submitUser\(\{\s*side,\s*price:\s*finalOrderPrice/,
  );
  assert.match(
    source,
    /market\.normalizeLimitPrice\(Number\(targetPrice\)\)/,
  );
  assert.match(
    source,
    /const normalizedLimitReference = activeMarket[\s\S]*activeMarket\.normalizeLimitPrice/,
  );
});

test('Arena JSX wires persisted simulation controls, bounded depth, and insights', () => {
  const filename = path.join(__dirname, '..', 'js', 'cuanmeter', 'arena.jsx');
  const source = fs.readFileSync(filename, 'utf8');

  assert.match(source, /const marketProfile = account\.market\?\.profile \|\| 'normal'/);
  assert.match(source, /const marketSpeed = account\.market\?\.speed \|\| 1/);
  assert.match(source, /profile:\s*marketProfile/);
  assert.match(source, /speed:\s*marketSpeed/);
  assert.match(source, /marketRef\.current\.setSpeed\(marketSpeed\)/);
  assert.match(source, /setArenaMarketPreferences\(\{\s*speed\s*\}\)/);
  assert.match(source, /setArenaMarketPreferences\(\{\s*profile:\s*nextProfile\s*\}\)/);
  assert.match(source, /Object\.values\(ARENA_PROFILES\)/);
  assert.match(source, /ARENA_SPEEDS\.map/);
  assert.match(source, /function arenaDepthWidth/);
  assert.match(source, /function ArenaInsights/);
  assert.match(source, /<ArenaInsights insights=\{snap\?\.insights\}/);
});

test('Arena JSX formats aggregate depth compactly and displays queue position', () => {
  const filename = path.join(__dirname, '..', 'js', 'cuanmeter', 'arena.jsx');
  const source = fs.readFileSync(filename, 'utf8');

  assert.match(source, /function arenaCompactLot\(/);
  assert.match(source, /arenaCompactLot\(bid\.lot\)/);
  assert.match(source, /arenaCompactLot\(ask\.lot\)/);
  assert.match(source, /antrean depan/);
  assert.match(source, /aheadLot/);
});

test('restingOrders returns flat snapshots with side, price, lot, and owner', () => {
  const book = createBook(1);
  const firstBid = book.submit({ side: 'buy', price: 100, lot: 7, owner: 'mm:bid' });
  const secondBid = book.submit({ side: 'buy', price: 99, lot: 3, owner: 'user' });
  const firstAsk = book.submit({ side: 'sell', price: 102, lot: 5, owner: 'wall:ask' });

  assert.deepEqual(localize(book.restingOrders()), [
    { id: firstBid.restId, side: 'buy', price: 100, lot: 7, owner: 'mm:bid' },
    { id: secondBid.restId, side: 'buy', price: 99, lot: 3, owner: 'user' },
    { id: firstAsk.restId, side: 'sell', price: 102, lot: 5, owner: 'wall:ask' },
  ]);
});

test('restingOrders snapshots cannot mutate engine state', () => {
  const book = createBook(1);
  const order = book.submit({ side: 'buy', price: 100, lot: 7, owner: 'mm:bid' });
  const snapshot = book.restingOrders();

  snapshot[0].lot = 999;
  snapshot[0].owner = 'changed';
  snapshot.push({ id: 999, side: 'sell', price: 1, lot: 1, owner: 'fake' });

  assert.deepEqual(localize(book.restingOrders()), [
    { id: order.restId, side: 'buy', price: 100, lot: 7, owner: 'mm:bid' },
  ]);
});

test('submit normalizes object owners before storing snapshots and trade records', () => {
  const book = createBook(1);
  const restingOwner = { tag: 'bot' };
  const resting = book.submit({
    side: 'sell',
    price: 105,
    lot: 4,
    owner: restingOwner,
  });

  restingOwner.tag = 'changed';
  const snapshot = book.restingOrders()[0];
  assert.equal(snapshot.owner, '[object Object]');

  snapshot.owner.tag = 'snapshot-change';
  assert.equal(book.inspectOrder(resting.restId).owner, '[object Object]');

  const incomingOwner = { tag: 'buyer' };
  const result = book.submit({
    side: 'buy',
    price: 105,
    lot: 1,
    owner: incomingOwner,
  });

  incomingOwner.tag = 'changed';
  assert.deepEqual(localize(result.trades), [
    {
      price: 105,
      lot: 1,
      aggressor: 'buy',
      buyOwner: '[object Object]',
      sellOwner: '[object Object]',
    },
  ]);
});

test('restingOrders preserves FIFO order within the same price level', () => {
  const book = createBook(1);
  const oldest = book.submit({ side: 'buy', price: 100, lot: 2, owner: 'mm:first' });
  const newest = book.submit({ side: 'buy', price: 100, lot: 3, owner: 'mm:second' });

  assert.deepEqual(localize(book.restingOrders()), [
    { id: oldest.restId, side: 'buy', price: 100, lot: 2, owner: 'mm:first' },
    { id: newest.restId, side: 'buy', price: 100, lot: 3, owner: 'mm:second' },
  ]);
});

test('inspectOrder returns copy-safe snapshots and null for missing or cancelled orders', () => {
  const book = createBook(1);
  const order = book.submit({ side: 'sell', price: 105, lot: 8, owner: 'iceberg:ask' });

  const snapshot = book.inspectOrder(order.restId);
  assert.deepEqual(localize(snapshot), {
    id: order.restId,
    side: 'sell',
    price: 105,
    lot: 8,
    owner: 'iceberg:ask',
  });

  snapshot.lot = 1;
  snapshot.owner = 'changed';
  assert.equal(book.inspectOrder(order.restId).lot, 8);
  assert.equal(book.inspectOrder(99999), null);

  assert.equal(book.cancel(order.restId), true);
  assert.equal(book.inspectOrder(order.restId), null);
});

test('cancelByOwnerPrefix removes only matching synthetic owners', () => {
  const book = createBook(1);
  book.submit({ side: 'buy', price: 101, lot: 2, owner: 'mm:bid:1' });
  book.submit({ side: 'buy', price: 100, lot: 3, owner: 'mm:bid:2' });
  book.submit({ side: 'sell', price: 104, lot: 4, owner: 'mm:ask:1' });
  book.submit({ side: 'sell', price: 105, lot: 5, owner: 'mm:ask:2' });
  const user = book.submit({ side: 'buy', price: 99, lot: 4, owner: 'user' });
  const wall = book.submit({ side: 'sell', price: 106, lot: 5, owner: 'wall:ask' });
  const retail = book.submit({ side: 'buy', price: 98, lot: 6, owner: 'retail:1' });

  assert.equal(book.bestBid(), 101);
  assert.equal(book.bestAsk(), 104);
  assert.equal(book.cancelByOwnerPrefix('mm:'), 4);
  assert.equal(book.bestBid(), 99);
  assert.equal(book.bestAsk(), 106);
  assert.deepEqual(localize(book.depth(5)), {
    bids: [
      { price: 99, lot: 4, freq: 1 },
      { price: 98, lot: 6, freq: 1 },
    ],
    asks: [
      { price: 106, lot: 5, freq: 1 },
    ],
  });
  assert.deepEqual(localize(book.restingOrders()), [
    { id: user.restId, side: 'buy', price: 99, lot: 4, owner: 'user' },
    { id: retail.restId, side: 'buy', price: 98, lot: 6, owner: 'retail:1' },
    { id: wall.restId, side: 'sell', price: 106, lot: 5, owner: 'wall:ask' },
  ]);
});

test('cancelByOwnerPrefix safely ignores empty, non-string, and nonmatching prefixes', () => {
  const book = createBook(1);
  book.submit({ side: 'buy', price: 100, lot: 2, owner: 'mm:bid:1' });
  book.submit({ side: 'sell', price: 105, lot: 3, owner: 'user' });

  assert.equal(book.cancelByOwnerPrefix(''), 0);
  assert.equal(book.cancelByOwnerPrefix(null), 0);
  assert.equal(book.cancelByOwnerPrefix(undefined), 0);
  assert.equal(book.cancelByOwnerPrefix(123), 0);
  assert.equal(book.cancelByOwnerPrefix('missing:'), 0);
  assert.equal(book.restingOrders().length, 2);
});

test('price-time matching still fills oldest order first and reports partial remainder', () => {
  const book = createBook(1);
  const oldest = book.submit({ side: 'sell', price: 105, lot: 5, owner: 'mm:oldest' });
  const newest = book.submit({ side: 'sell', price: 105, lot: 7, owner: 'mm:newest' });

  const result = book.submit({ side: 'buy', price: 105, lot: 8, owner: 'user' });

  assert.deepEqual(localize(result.trades), [
    { price: 105, lot: 5, aggressor: 'buy', buyOwner: 'user', sellOwner: 'mm:oldest' },
    { price: 105, lot: 3, aggressor: 'buy', buyOwner: 'user', sellOwner: 'mm:newest' },
  ]);
  assert.equal(book.inspectOrder(oldest.restId), null);
  assert.deepEqual(localize(book.inspectOrder(newest.restId)), {
    id: newest.restId,
    side: 'sell',
    price: 105,
    lot: 4,
    owner: 'mm:newest',
  });
});

test('amend reducing quantity preserves order id and FIFO priority', () => {
  const book = createBook(1);
  const first = book.submit({ side: 'buy', price: 100, lot: 10, owner: 'first' });
  const second = book.submit({ side: 'buy', price: 100, lot: 8, owner: 'second' });

  const amended = book.amend(first.restId, { lot: 6 });

  assert.deepEqual(localize(amended), {
    changed: true,
    restId: first.restId,
    trades: [],
  });
  assert.deepEqual(localize(book.restingOrders()), [
    { id: first.restId, side: 'buy', price: 100, lot: 6, owner: 'first' },
    { id: second.restId, side: 'buy', price: 100, lot: 8, owner: 'second' },
  ]);
});

test('amend increasing quantity loses FIFO priority', () => {
  const book = createBook(1);
  const first = book.submit({ side: 'sell', price: 105, lot: 5, owner: 'first' });
  const second = book.submit({ side: 'sell', price: 105, lot: 8, owner: 'second' });

  const amended = book.amend(first.restId, { lot: 12 });

  assert.equal(amended.changed, true);
  assert.notEqual(amended.restId, first.restId);
  assert.deepEqual(localize(book.restingOrders()), [
    { id: second.restId, side: 'sell', price: 105, lot: 8, owner: 'second' },
    { id: amended.restId, side: 'sell', price: 105, lot: 12, owner: 'first' },
  ]);
});

test('amend changing price resubmits at the new level', () => {
  const book = createBook(1);
  const original = book.submit({ side: 'buy', price: 100, lot: 7, owner: 'maker' });

  const amended = book.amend(original.restId, { price: 101, lot: 7 });

  assert.equal(amended.changed, true);
  assert.notEqual(amended.restId, original.restId);
  assert.equal(book.inspectOrder(original.restId), null);
  assert.deepEqual(localize(book.inspectOrder(amended.restId)), {
    id: amended.restId,
    side: 'buy',
    price: 101,
    lot: 7,
    owner: 'maker',
  });
});

test('market maker seeds persistent profile depth and retains ordinary quote IDs', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    rng: runtime.createArenaRng(808),
  });
  const first = market.book.restingOrders()
    .filter((order) => order.owner.startsWith('mm:'));

  market.step(500);

  const second = market.book.restingOrders()
    .filter((order) => order.owner.startsWith('mm:'));
  const retained = second.filter((order) => (
    first.some((before) => before.id === order.id)
  ));
  const depth = market.book.depth(20);

  assert.ok(depth.bids.length >= 8);
  assert.ok(depth.asks.length >= 8);
  assert.ok(retained.length >= Math.floor(first.length * 0.6));
});

test('market maker uses aggregate profile depth instead of ordinary agent lots', () => {
  const runtime = loadArenaRuntime();
  const profile = runtime.ARENA_PROFILES.liquid;
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'liquid',
    seed: 7_701,
  });
  const makerOrders = market.book.restingOrders()
    .filter((order) => order.owner.startsWith('mm:'));
  const aggregateBySlot = new Map();

  makerOrders.forEach((order) => {
    aggregateBySlot.set(
      order.owner,
      (aggregateBySlot.get(order.owner) || 0) + order.lot,
    );
  });

  assert.ok(makerOrders.length > 0);
  assert.ok(makerOrders.length > aggregateBySlot.size);
  aggregateBySlot.forEach((lot) => {
    assert.ok(lot >= profile.depthLotMin);
    assert.ok(lot <= profile.depthLotMax);
  });
});

test('lotsAhead reports only older lots at the same price level', () => {
  const book = createBook(1);
  const first = book.submit({ side: 'buy', price: 130, lot: 4_000, owner: 'market' });
  const user = book.submit({ side: 'buy', price: 130, lot: 100, owner: 'user' });
  const later = book.submit({ side: 'buy', price: 130, lot: 2_000, owner: 'market-later' });
  book.submit({ side: 'buy', price: 129, lot: 9_000, owner: 'other-price' });

  assert.equal(book.lotsAhead(first.restId), 0);
  assert.equal(book.lotsAhead(user.restId), 4_000);
  assert.equal(book.lotsAhead(later.restId), 4_100);
  assert.equal(book.lotsAhead(999_999), null);
});

test('market userOrders includes FIFO lots ahead for every player order', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    seed: 8_801,
    forcedRegime: 'quiet',
  });
  const price = market.snapshot(20).bestBid;
  const result = market.submitUser({ side: 'buy', price, lot: 100 });
  const order = market.userOrders().find((candidate) => candidate.id === result.restId);

  assert.ok(order);
  assert.ok(Number.isFinite(order.aheadLot));
  assert.ok(order.aheadLot >= 1_000);
});

test('market maker target lots remain uneven with a constant RNG', () => {
  const runtime = loadArenaRuntime();
  const profile = runtime.ARENA_PROFILES.normal;
  const agent = runtime.createMarketMakerAgent({
    profile,
    rng: () => 0.5,
  });
  const targetLots = localize(agent.slots.map((slot) => slot.targetLot));

  assert.ok(new Set(targetLots).size > 1);
  assert.ok(targetLots.every((lot) => (
    lot >= profile.depthLotMin && lot <= profile.depthLotMax
  )));
});

test('order flow agent performs one atomic queue mutation per operation', () => {
  const runtime = loadArenaRuntime();
  const harness = createFlowHarness(runtime, { seed: 401 });
  const agent = runtime.createOrderFlowAgent({
    profile: runtime.ARENA_PROFILES.normal,
    rng: runtime.createArenaRng(401),
  });

  const beforeAdd = harness.book.restingOrders();
  const added = agent.addPassive(harness.context);
  const afterAdd = harness.book.restingOrders();
  assert.equal(added.type, 'ADD');
  assert.equal(added.changed, true);
  assert.equal(afterAdd.length, beforeAdd.length + 1);

  const beforeCancel = afterAdd;
  const cancelled = agent.cancelOne(harness.context);
  const afterCancel = harness.book.restingOrders();
  assert.equal(cancelled.type, 'CANCEL');
  assert.equal(cancelled.changed, true);
  assert.equal(afterCancel.length, beforeCancel.length - 1);

  const beforeAmend = afterCancel;
  const amended = agent.amendOne(harness.context);
  const afterAmend = harness.book.restingOrders();
  assert.equal(amended.type, 'AMEND');
  assert.equal(amended.changed, true);
  assert.notDeepEqual(localize(afterAmend), localize(beforeAmend));
});

test('order flow MATCH executes against the current best quote', () => {
  const runtime = loadArenaRuntime();
  const harness = createFlowHarness(runtime, { seed: 402 });
  const agent = runtime.createOrderFlowAgent({
    profile: runtime.ARENA_PROFILES.normal,
    rng: () => 0,
  });
  const previousLast = harness.book.last;

  const result = agent.match(harness.context);

  assert.equal(result.type, 'MATCH');
  assert.ok(result.trades.length > 0);
  assert.notEqual(harness.book.last, null);
  assert.ok(harness.book.last >= previousLast);
});

test('order flow SWEEP consumes more than one opposing order', () => {
  const runtime = loadArenaRuntime();
  const harness = createFlowHarness(runtime, { seed: 403 });
  const agent = runtime.createOrderFlowAgent({
    profile: runtime.ARENA_PROFILES.normal,
    rng: () => 0,
  });

  const result = agent.sweep(harness.context);

  assert.equal(result.type, 'SWEEP');
  assert.ok(result.trades.length >= 2);
  assert.ok(result.lot >= result.trades.reduce((sum, trade) => sum + trade.lot, 0));
});

test('retail flow creates irregular trade and idle cycles with a seeded RNG', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    forcedRegime: 'normal',
    rng: runtime.createArenaRng(91),
  });
  let tradeCycles = 0;

  for (let index = 0; index < 200; index += 1) {
    if (market.step(500).tradeCount > 0) tradeCycles += 1;
  }

  assert.ok(tradeCycles > 30, `expected >30 trade cycles, received ${tradeCycles}`);
  assert.ok(tradeCycles < 180, `expected <180 trade cycles, received ${tradeCycles}`);
});

test('retail passive orders stay bounded during long quiet sessions', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'liquid',
    forcedRegime: 'quiet',
    rng: runtime.createArenaRng(123),
  });
  let maximumRetailOrders = 0;

  for (let index = 0; index < 800; index += 1) {
    market.step(500);
    const retailOrders = market.book.restingOrders()
      .filter((order) => order.owner.startsWith('retail:'));
    maximumRetailOrders = Math.max(maximumRetailOrders, retailOrders.length);
  }

  assert.ok(
    maximumRetailOrders <= 36,
    `expected at most 36 retail orders, received ${maximumRetailOrders}`,
  );
});

test('wall is at least four times median nearby depth and persists across steps', () => {
  const runtime = loadArenaRuntime();
  const harness = createAgentHarness(runtime, { seed: 72, profile: 'normal' });
  const wall = runtime.createWallAgent(harness.context, {
    side: 'sell',
    price: 145,
    lifetimeMs: 10_000,
  });

  wall.step({ now: 0 });
  const first = harness.book.restingByOwner(wall.owner);
  wall.step({ now: 5_000 });
  const second = harness.book.restingByOwner(wall.owner);

  assert.ok(first[0].lot >= 4 * harness.nearbyMedian('sell'));
  assert.equal(second[0].id, first[0].id);
});

test('spoof insight appears after withdrawal, never while active', () => {
  const runtime = loadArenaRuntime();
  const harness = createAgentHarness(runtime, { seed: 17, profile: 'gorengan' });
  const spoof = runtime.createSpoofAgent(harness.context, {
    side: 'sell',
    price: 146,
    lifetimeMs: 5_000,
  });

  spoof.step({ now: 0 });
  assert.equal(harness.insights.length, 0);
  spoof.step({ now: 5_001 });
  assert.equal(harness.insights.length, 1);
  assert.equal(harness.insights[0].category, 'spoof');
  assert.match(harness.insights[0].message, /indikasi spoofing/i);
});

test('iceberg insight requires at least two replenishments', () => {
  const runtime = loadArenaRuntime();
  const harness = createAgentHarness(runtime, { seed: 44, profile: 'normal' });
  const iceberg = runtime.createIcebergAgent(harness.context, {
    side: 'sell',
    price: 145,
    visibleLot: 20,
    hiddenLot: 80,
  });

  iceberg.step({ now: 0 });
  harness.consumeOwnerOrder(iceberg.owner);
  iceberg.step({ now: 1_000 });
  assert.equal(harness.insights.length, 0);
  harness.consumeOwnerOrder(iceberg.owner);
  iceberg.step({ now: 2_000 });
  iceberg.finish({ now: 3_000 });
  assert.equal(harness.insights[0].category, 'iceberg');
});

test('momentum follows a two-tick move with an aggressive order', () => {
  const runtime = loadArenaRuntime();
  const harness = createAgentHarness(runtime, { seed: 51, profile: 'normal' });
  const momentum = runtime.createMomentumAgent({
    profile: runtime.ARENA_PROFILES.normal,
    rng: () => 0,
  });
  const context = {
    ...harness.context,
    regime: {
      id: 'trend_up',
      activity: 1,
      aggression: 1,
      bias: 0.3,
    },
    getFairValue: () => harness.book.last,
  };

  harness.book.last = 140;
  momentum.step(context);
  harness.book.last = 141;
  momentum.step(context);
  harness.book.last = 142;
  const result = momentum.step(context);

  assert.ok(result.trades.length > 0);
  assert.ok(result.trades.every((trade) => trade.buyOwner.startsWith('momentum:')));
});

test('market schedules capped special events and keeps bounded synthetic state', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'gorengan',
    forcedRegime: 'volatile',
    seed: 991,
    initialSpecialEventAt: 0,
    specialEventSequence: ['spoof', 'iceberg', 'wall', 'whale'],
  });
  let sawSpecialOrder = false;

  for (let index = 0; index < 400; index += 1) {
    market.step(500);
    const syntheticOrders = market.book.restingOrders()
      .filter((order) => order.owner !== 'user');
    sawSpecialOrder ||= syntheticOrders.some((order) => (
      /^(spoof|iceberg|wall|whale):/.test(order.owner)
    ));
    // 26 contiguous levels x ~4 MM orders seeds ~230 orders on gorengan.
    assert.ok(syntheticOrders.length <= 300);
    assert.ok(market.snapshot().insights.length <= 5);
  }

  assert.equal(sawSpecialOrder, true);
  assert.ok(market.snapshot().insights.length > 0);
});

test('quiet regime trades less often than normal and both contain idle cycles', () => {
  const runtime = loadArenaRuntime();
  const quiet = sampleMarket(runtime, {
    seed: 10,
    profile: 'normal',
    forcedRegime: 'quiet',
  });
  const normal = sampleMarket(runtime, {
    seed: 10,
    profile: 'normal',
    forcedRegime: 'normal',
  });

  assert.ok(sumTrades(quiet) < sumTrades(normal) * 0.75);
  assert.ok(quiet.some((sample) => sample.tradeCount === 0));
  assert.ok(normal.some((sample) => sample.tradeCount === 0));
});

test('panic buy produces a stronger upward price move than normal', () => {
  const runtime = loadArenaRuntime();
  const panic = sampleMarket(runtime, {
    seed: 22,
    profile: 'normal',
    forcedRegime: 'panic_buy',
  });
  const normal = sampleMarket(runtime, {
    seed: 22,
    profile: 'normal',
    forcedRegime: 'normal',
  });

  assert.ok(netPriceMove(panic) > netPriceMove(normal));
});

test('liquid profile stays deeper and seeds tighter than gorengan', () => {
  const runtime = loadArenaRuntime();
  const liquid = sampleMarket(runtime, {
    seed: 37,
    profile: 'liquid',
    forcedRegime: 'normal',
  });
  const gorengan = sampleMarket(runtime, {
    seed: 37,
    profile: 'gorengan',
    forcedRegime: 'normal',
  });

  assert.ok(averageDepth(liquid) > averageDepth(gorengan));
  // gorengan spreadTicks [1, 3] can also seed a 1-tick spread, so only "not wider".
  assert.ok(liquid[0].spread <= gorengan[0].spread);
});

test('Arena store persists normalized market preferences across account reset', () => {
  const runtime = loadArenaStoreRuntime();
  assert.deepEqual(localize(runtime.getArena().market), {
    profile: 'normal',
    speed: 1,
  });

  runtime.setArenaMarketPreferences({ profile: 'gorengan', speed: 5 });
  assert.deepEqual(localize(runtime.getArena().market), {
    profile: 'gorengan',
    speed: 5,
  });

  runtime.resetArena(25_000_000, 'BBCA');
  const reset = localize(runtime.getArena());
  assert.equal(reset.cash, 25_000_000);
  assert.deepEqual(reset.market, {
    profile: 'gorengan',
    speed: 5,
  });
});

test('Arena store normalizes invalid persisted market preferences', () => {
  const runtime = loadArenaStoreRuntime({
    cash: 100_000_000,
    market: { profile: 'constructor', speed: 3 },
  });

  assert.deepEqual(localize(runtime.getArena().market), {
    profile: 'normal',
    speed: 1,
  });
});

test('market profiles control initial depth and unknown profiles fall back to normal', () => {
  const runtime = loadArenaRuntime();
  const liquid = runtime.createMarket({
    seedPrice: 140,
    profile: 'liquid',
    rng: runtime.createArenaRng(1),
  });
  const gorengan = runtime.createMarket({
    seedPrice: 140,
    profile: 'gorengan',
    rng: runtime.createArenaRng(1),
  });
  const fallback = runtime.createMarket({
    seedPrice: 140,
    profile: 'unknown',
    rng: runtime.createArenaRng(1),
  });

  // All profiles seed 26 contiguous levels; the bid side is clipped at ARB (119 for 140).
  for (const market of [liquid, gorengan, fallback]) {
    const depth = market.book.depth(40);
    assert.equal(depth.asks.length, 26);
    assert.equal(depth.bids.at(-1).price, market.snapshot().stats.arb);
  }
});

test('seed option makes markets deterministic when rng is omitted', () => {
  const runtime = loadArenaRuntime();
  const options = {
    seedPrice: 140,
    seed: 2026,
    profile: 'normal',
    forcedRegime: 'normal',
  };
  const first = runtime.createMarket(options);
  const second = runtime.createMarket(options);

  assert.deepEqual(localize(first.snapshot()), localize(second.snapshot()));
  for (let index = 0; index < 20; index += 1) {
    assert.deepEqual(localize(first.step(500)), localize(second.step(500)));
    assert.deepEqual(localize(first.snapshot()), localize(second.snapshot()));
  }
});

test('fair value stays tick-aligned inside the raw twenty-percent bounds', () => {
  const runtime = loadArenaRuntime();
  const seedPrice = 9_075;
  const minimum = seedPrice * 0.8;
  const maximum = seedPrice * 1.2;
  const markets = [
    runtime.createMarket({
      seedPrice,
      profile: 'gorengan',
      forcedRegime: 'panic_buy',
      rng: () => 1,
    }),
    runtime.createMarket({
      seedPrice,
      profile: 'gorengan',
      forcedRegime: 'panic_sell',
      rng: () => 0,
    }),
  ];

  for (const market of markets) {
    for (let index = 0; index < 200; index += 1) {
      market.step(2_000);
      const { ref, tick } = market.snapshot();
      assert.ok(ref >= minimum, `${ref} must be >= ${minimum}`);
      assert.ok(ref <= maximum, `${ref} must be <= ${maximum}`);
      assert.equal(ref % tick, 0);
    }
  }
});

test('Arena daily bands use regular-board ARA, flat ARB, valid ticks, and minimum 50', () => {
  const runtime = loadArenaRuntime();
  const price468 = runtime.createMarket({
    seedPrice: 468,
    seed: 1,
    forcedRegime: 'normal',
  }).snapshot();
  const price50 = runtime.createMarket({
    seedPrice: 50,
    seed: 1,
    forcedRegime: 'normal',
  }).snapshot();

  assert.equal(price468.stats.ara, 585);
  assert.equal(price468.stats.arb, 398);
  assert.equal(price50.stats.arb, 50);
  assert.equal(price50.ref, 50);
});

test('dynamic ticks keep fair value and synthetic quotes valid across IDX price bands', () => {
  const runtime = loadArenaRuntime();
  const seeds = [50, 199, 200, 499, 500, 1_999, 2_000, 4_999, 5_000, 9_075];

  for (const seedPrice of seeds) {
    for (const [forcedRegime, rng] of [
      ['panic_buy', () => 1],
      ['panic_sell', () => 0],
    ]) {
      const market = runtime.createMarket({
        seedPrice,
        profile: 'gorengan',
        forcedRegime,
        rng,
      });
      assertValidSyntheticState(runtime, market, seedPrice);

      for (let index = 0; index < 120; index += 1) {
        market.step(2_000);
        assertValidSyntheticState(runtime, market, seedPrice);
      }
    }
  }
});

test('market snapshot preserves the Arena contract and adds regime and insights', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    forcedRegime: 'quiet',
    rng: runtime.createArenaRng(4),
  });
  const snapshot = localize(market.snapshot());

  assert.deepEqual(Object.keys(snapshot).sort(), [
    'bestAsk',
    'bestBid',
    'depth',
    'done',
    'doneBuy',
    'doneSell',
    'insights',
    'last',
    'lastEvent',
    'ref',
    'regime',
    'stats',
    'tick',
  ]);
  assert.deepEqual(Object.keys(snapshot.stats).sort(), [
    'ara',
    'arb',
    'avg',
    'freq',
    'high',
    'low',
    'open',
    'prevClose',
    'val',
    'vol',
  ]);
  assert.equal(snapshot.regime.id, 'quiet');
  assert.deepEqual(snapshot.insights, []);
  assert.deepEqual(snapshot.lastEvent, {
    type: 'SEED',
    side: null,
    price: 140,
    lot: 0,
    tradeCount: 0,
    simTime: 0,
  });
  assert.equal(snapshot.depth.bids.length, 21); // 139..119, clipped at ARB
  assert.equal(snapshot.depth.asks.length, 26);
});

test('snapshot copies done, insights, regime, and initial insight input', () => {
  const runtime = loadArenaRuntime();
  const initialInsights = [{
    type: 'spoof',
    side: 'sell',
    price: 145,
  }];
  const market = runtime.createMarket({
    seedPrice: 140,
    seed: 71,
    forcedRegime: 'normal',
    initialInsights,
  });

  initialInsights[0].type = 'mutated-input';
  initialInsights.push({ type: 'extra-input' });
  market.submitUser({ side: 'sell', price: null, lot: 1 });

  const first = market.snapshot();
  const tradedPrice = String(first.last);
  assert.equal(first.insights[0].type, 'spoof');
  assert.equal(first.insights.length, 1);
  assert.ok(first.done[tradedPrice] > 0);

  first.done[tradedPrice] = 999_999;
  first.insights[0].type = 'mutated-snapshot';
  first.insights.push({ type: 'extra-snapshot' });
  first.regime.id = 'mutated-regime';
  first.lastEvent.type = 'mutated-event';

  const second = market.snapshot();
  assert.notEqual(second.done[tradedPrice], 999_999);
  assert.deepEqual(localize(second.insights), [{
    type: 'spoof',
    side: 'sell',
    price: 145,
  }]);
  assert.equal(second.regime.id, 'normal');
  assert.notEqual(second.lastEvent.type, 'mutated-event');
});

test('forced queue events mutate queues without changing trade statistics or last price', () => {
  const runtime = loadArenaRuntime();

  for (const eventType of ['ADD', 'CANCEL', 'AMEND', 'IDLE']) {
    const market = runtime.createMarket({
      seedPrice: 140,
      profile: 'normal',
      seed: 4_400 + eventType.length,
      forcedRegime: 'normal',
      flowEventSequence: [eventType],
      initialSpecialEventAt: Number.POSITIVE_INFINITY,
    });
    const before = market.snapshot(20);
    const beforeOrders = market.book.restingOrders();
    const cycle = market.step(250);
    const after = market.snapshot(20);
    const afterOrders = market.book.restingOrders();

    assert.equal(cycle.event.type, eventType);
    assert.equal(after.lastEvent.type, eventType);
    assert.equal(after.last, before.last);
    assert.deepEqual(localize(after.stats), localize(before.stats));
    if (eventType === 'IDLE') {
      assert.deepEqual(localize(afterOrders), localize(beforeOrders));
    } else {
      assert.notDeepEqual(localize(afterOrders), localize(beforeOrders));
    }
  }
});

test('forced MATCH and SWEEP events update actual trade statistics', () => {
  const runtime = loadArenaRuntime();

  for (const eventType of ['MATCH', 'SWEEP']) {
    const market = runtime.createMarket({
      seedPrice: 140,
      profile: 'normal',
      seed: 5_500 + eventType.length,
      forcedRegime: 'trend_up',
      flowEventSequence: [eventType],
      initialSpecialEventAt: Number.POSITIVE_INFINITY,
    });
    const before = market.snapshot(20);
    const cycle = market.step(250);
    const after = market.snapshot(20);

    assert.equal(cycle.event.type, eventType);
    assert.equal(after.lastEvent.type, eventType);
    assert.ok(cycle.tradeCount > 0);
    assert.ok(after.stats.vol > before.stats.vol);
    assert.ok(after.stats.freq > before.stats.freq);
    assert.ok(after.done[String(after.last)] > 0);
  }
});

test('normal seeded flow produces more queue events than aggressive events', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    seed: 6_606,
    forcedRegime: 'normal',
    initialSpecialEventAt: Number.POSITIVE_INFINITY,
  });
  const counts = {
    ADD: 0,
    CANCEL: 0,
    AMEND: 0,
    MATCH: 0,
    SWEEP: 0,
    IDLE: 0,
  };

  for (let index = 0; index < 2_000; index += 1) {
    const event = market.step(250).event;
    counts[event.type] += 1;
  }

  const queueEvents = counts.ADD + counts.CANCEL + counts.AMEND;
  const aggressiveEvents = counts.MATCH + counts.SWEEP;
  assert.ok(queueEvents > aggressiveEvents * 1.8, JSON.stringify(counts));
  assert.ok(counts.IDLE > 0, JSON.stringify(counts));
});

test('event-driven market maker keeps both sides populated during long sessions', () => {
  const runtime = loadArenaRuntime();

  for (const profileId of ['liquid', 'normal']) {
    const profile = runtime.ARENA_PROFILES[profileId];
    const market = runtime.createMarket({
      seedPrice: 140,
      profile: profileId,
      seed: 60_608,
      forcedRegime: 'normal',
      initialSpecialEventAt: Number.POSITIVE_INFINITY,
    });

    for (let index = 0; index < 1_000; index += 1) {
      market.step(250);
    }

    const snapshot = market.snapshot(10);
    const { depth } = snapshot;
    const bidLot = depth.bids.reduce((sum, level) => sum + level.lot, 0);
    const askLot = depth.asks.reduce((sum, level) => sum + level.lot, 0);
    const bidAtArb = snapshot.bestBid === snapshot.stats.arb;
    const askAtAra = snapshot.bestAsk === snapshot.stats.ara;

    assert.ok(
      depth.bids.length >= 4 || bidAtArb,
      `${profileId} bid levels: ${depth.bids.length}`,
    );
    assert.ok(
      depth.asks.length >= 4 || askAtAra,
      `${profileId} ask levels: ${depth.asks.length}`,
    );
    assert.ok(bidLot >= profile.depthLotMin, `${profileId} bid lot: ${bidLot}`);
    assert.ok(askLot >= profile.depthLotMin, `${profileId} ask lot: ${askLot}`);
  }
});

test('event-driven market maker repairs a hollow normal top of book', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    seed: 26,
    forcedRegime: 'normal',
    initialSpecialEventAt: Number.POSITIVE_INFINITY,
  });

  let widest = null;
  for (let index = 0; index < 800; index += 1) {
    market.step(250);
    const snapshot = market.snapshot(10);
    let price = snapshot.bestBid;
    let spreadTicks = 0;
    while (price < snapshot.bestAsk && spreadTicks < 100) {
      price = runtime.nextArenaPrice(price);
      spreadTicks += 1;
    }
    if (!widest || spreadTicks > widest.spreadTicks) {
      widest = {
        bestBid: snapshot.bestBid,
        bestAsk: snapshot.bestAsk,
        spreadTicks,
      };
    }
  }

  assert.ok(widest.spreadTicks <= 4, JSON.stringify(widest));
});

test('event-driven market maker keeps the nearest ladder levels contiguous', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    seed: 38,
    forcedRegime: 'normal',
    initialSpecialEventAt: Number.POSITIVE_INFINITY,
  });

  for (let index = 0; index < 800; index += 1) {
    market.step(250);
  }

  const depth = market.snapshot(10).depth;
  const nearestBids = depth.bids.map((level) => level.price);
  const nearestAsks = depth.asks.map((level) => level.price);

  assert.equal(nearestBids.length, 10);
  assert.equal(nearestAsks.length, 10);
  nearestBids.slice(1).forEach((price, index) => {
    assert.equal(price, runtime.previousArenaPrice(nearestBids[index]));
  });
  nearestAsks.slice(1).forEach((price, index) => {
    assert.equal(price, runtime.nextArenaPrice(nearestAsks[index]));
  });
});

test('user order API keeps resting, cancellation, and fill callbacks compatible', () => {
  const runtime = loadArenaRuntime();
  const callbacks = [];
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    forcedRegime: 'normal',
    rng: runtime.createArenaRng(5),
    onTrade: (trade) => callbacks.push(localize(trade)),
  });
  const bestAsk = market.book.bestAsk();
  const fill = market.submitUser({ side: 'sell', price: null, lot: 2 });

  assert.ok(fill.trades.length > 0);
  assert.equal(fill.restingLot, 0);
  assert.equal(fill.restId, null);
  assert.equal(callbacks.length, fill.trades.length);
  assert.ok(callbacks.every((trade) => trade.sellOwner === 'user'));

  const resting = market.submitUser({
    side: 'sell',
    price: bestAsk + (30 * market.tick),
    lot: 3,
  });
  assert.equal(resting.trades.length, 0);
  assert.equal(resting.restingLot, 3);
  assert.ok(resting.restId);
  assert.deepEqual(localize(market.userOrders()), [{
    id: resting.restId,
    side: 'sell',
    price: bestAsk + (30 * market.tick),
    lot: 3,
    aheadLot: 0,
  }]);
  assert.equal(market.cancel(resting.restId), true);
  assert.deepEqual(localize(market.userOrders()), []);
});

test('submitUser normalizes limit prices and clamps them to daily bands', () => {
  const runtime = loadArenaRuntime();

  const boundaryMarket = runtime.createMarket({
    seedPrice: 200,
    seed: 301,
    forcedRegime: 'quiet',
  });
  const normalized = boundaryMarket.submitUser({
    side: 'sell',
    price: 201,
    lot: 3,
  });
  assert.equal(normalized.restingLot, 3);
  assert.equal(boundaryMarket.book.inspectOrder(normalized.restId).price, 202);

  const highMarket = runtime.createMarket({
    seedPrice: 468,
    seed: 302,
    forcedRegime: 'quiet',
  });
  const aboveAra = highMarket.submitUser({
    side: 'sell',
    price: 99_999,
    lot: 2,
  });
  assert.equal(highMarket.book.inspectOrder(aboveAra.restId).price, 585);

  const belowArb = highMarket.submitUser({
    side: 'buy',
    price: 1,
    lot: 2,
  });
  const restingBuy = highMarket.book.inspectOrder(belowArb.restId);
  assert.equal(restingBuy.price, 398);
  assert.equal(restingBuy.price % runtime.tickSizeFor(restingBuy.price), 0);

  const marketOrder = highMarket.submitUser({
    side: 'buy',
    price: null,
    lot: 1,
  });
  assert.equal(marketOrder.restId, null);
});

test('market exposes the final limit price used by submitUser', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 468,
    seed: 303,
    forcedRegime: 'quiet',
  });

  assert.equal(market.normalizeLimitPrice(1), 398);
  assert.equal(market.normalizeLimitPrice(499), 500);
  assert.equal(market.normalizeLimitPrice(1_000), 585);

  const result = market.submitUser({
    side: 'buy',
    price: 1,
    lot: 2,
  });
  assert.equal(market.book.inspectOrder(result.restId).price, 398);
});

test('invalid zero-lot user order does not emit a visible update', () => {
  const runtime = loadArenaRuntime();
  let updateCount = 0;
  const market = runtime.createMarket({
    seedPrice: 140,
    seed: 18,
    onUpdate: () => {
      updateCount += 1;
    },
  });

  const result = market.submitUser({
    side: 'buy',
    price: 140,
    lot: 0,
  });

  assert.deepEqual(localize(result), {
    trades: [],
    restingLot: 0,
    restId: null,
  });
  assert.equal(updateCount, 0);
});

test('scheduler is recursive, speed-aware, normalized, and start-stop idempotent', () => {
  const runtime = loadArenaRuntime();
  const fake = createFakeScheduler();
  const market = runtime.createMarket({
    seedPrice: 140,
    speed: 2,
    rng: runtime.createArenaRng(6),
    schedule: fake.schedule,
    cancelSchedule: fake.cancelSchedule,
  });

  assert.deepEqual(localize(market.getState()), {
    simNow: 0,
    speed: 2,
    running: false,
  });

  market.start(700);
  market.start();
  assert.equal(fake.pending.size, 1);
  assert.deepEqual(fake.scheduledDelays, [125]);
  assert.equal(market.getState().running, true);

  market.setSpeed('5');
  assert.equal(fake.pending.size, 1);
  assert.equal(fake.cancelled.length, 1);
  assert.deepEqual(fake.scheduledDelays, [125, 50]);
  assert.equal(market.getState().speed, 5);

  market.setSpeed(3);
  assert.equal(fake.pending.size, 1);
  assert.equal(fake.cancelled.length, 2);
  assert.deepEqual(fake.scheduledDelays, [125, 50, 250]);
  assert.equal(market.getState().speed, 1);

  market.stop();
  market.stop();
  assert.equal(fake.pending.size, 0);
  assert.equal(fake.cancelled.length, 3);
  assert.equal(market.getState().running, false);
});

test('reentrant setSpeed from onUpdate keeps exactly one scheduled callback', () => {
  const runtime = loadArenaRuntime();
  const fake = createFakeScheduler();
  let market;
  let updateCount = 0;
  market = runtime.createMarket({
    seedPrice: 140,
    seed: 29,
    forcedRegime: 'normal',
    schedule: fake.schedule,
    cancelSchedule: fake.cancelSchedule,
    onUpdate: () => {
      updateCount += 1;
      market.setSpeed(5);
    },
  });

  market.start(700);
  assert.equal(fake.pending.size, 1);
  assert.equal(fake.runNext(), true);
  assert.ok(updateCount > 0);
  assert.equal(market.getState().speed, 5);
  assert.equal(fake.pending.size, 1);
  assert.equal(fake.scheduledDelays.at(-1), 50);

  market.stop();
  assert.equal(fake.pending.size, 0);
});

test('throwing update callbacks are isolated and keep one recursive timer', () => {
  const runtime = loadArenaRuntime();
  const fake = createFakeScheduler();
  const errors = [];
  const market = runtime.createMarket({
    seedPrice: 140,
    seed: 83,
    forcedRegime: 'normal',
    schedule: fake.schedule,
    cancelSchedule: fake.cancelSchedule,
    onUpdate: () => {
      throw new Error('update failed');
    },
    onError: (error) => {
      errors.push(error.message);
    },
  });

  market.start(700);
  assert.doesNotThrow(() => fake.runNext());
  assert.equal(market.getState().running, true);
  assert.equal(fake.pending.size, 1);
  assert.ok(errors.includes('update failed'));
  market.stop();
});

test('throwing trade and error callbacks cannot break user fills or scheduling', () => {
  const runtime = loadArenaRuntime();
  const fake = createFakeScheduler();
  const market = runtime.createMarket({
    seedPrice: 140,
    forcedRegime: 'panic_buy',
    rng: () => 0,
    schedule: fake.schedule,
    cancelSchedule: fake.cancelSchedule,
    onTrade: () => {
      throw new Error('trade failed');
    },
    onError: () => {
      throw new Error('error handler failed');
    },
  });

  assert.doesNotThrow(() => {
    market.submitUser({ side: 'sell', price: null, lot: 1 });
  });
  market.start(700);
  assert.doesNotThrow(() => fake.runNext());
  assert.equal(market.getState().running, true);
  assert.equal(fake.pending.size, 1);
  market.stop();
});

test('unexpected step errors report safely and still schedule exactly one next cycle', () => {
  const runtime = loadArenaRuntime();
  const fake = createFakeScheduler();
  const errors = [];
  const market = runtime.createMarket({
    seedPrice: 140,
    seed: 97,
    flowEventSequence: ['ADD'],
    schedule: fake.schedule,
    cancelSchedule: fake.cancelSchedule,
    onError: (error) => {
      errors.push(error.message);
    },
  });
  market.book.submit = () => {
    throw new Error('agent failed');
  };

  market.start();
  assert.doesNotThrow(() => fake.runNext());
  assert.deepEqual(errors, ['agent failed']);
  assert.equal(market.getState().running, true);
  assert.equal(fake.pending.size, 1);
  market.stop();
});

test('step returns the exact cycle contract and normalizes simulated delta', () => {
  const runtime = loadArenaRuntime();
  const market = runtime.createMarket({
    seedPrice: 140,
    profile: 'normal',
    forcedRegime: 'quiet',
    rng: runtime.createArenaRng(7),
  });

  const first = localize(market.step(250));
  assert.deepEqual(Object.keys(first).sort(), [
    'changed',
    'event',
    'regimeChanged',
    'simNow',
    'tradeCount',
  ]);
  assert.equal(first.simNow, 250);
  assert.equal(typeof first.changed, 'boolean');
  assert.equal(typeof first.tradeCount, 'number');
  assert.equal(typeof first.regimeChanged, 'boolean');
  assert.deepEqual(Object.keys(first.event).sort(), [
    'lot',
    'price',
    'side',
    'simTime',
    'tradeCount',
    'type',
  ]);
  assert.ok(runtime.ARENA_FLOW_EVENTS.includes(first.event.type));
  assert.equal(first.event.tradeCount, 0);
  assert.equal(first.event.simTime, 250);

  assert.equal(market.step(0).simNow, 500);
  assert.equal(market.step(Number.NaN).simNow, 750);
  assert.equal(market.step().simNow, 1_000);
});
