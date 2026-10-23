const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ARENA_PROFILES,
  ARENA_REGIMES,
  ARENA_SPEEDS,
  REGIME_TRANSITIONS,
  createArenaRng,
  createFixedRegimeController,
  createRegimeController,
  median,
  normalizeArenaPreferences,
  speedToDelay,
} = require('../js/cuanmeter/arena-market.js');

function createSequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    return value == null ? 0 : value;
  };
}

const EXPECTED_PROFILES = {
  liquid: {
    id: 'liquid',
    label: 'Likuid',
    depthLevels: 26,
    spreadTicks: [1, 1],
    baseLotMin: 45,
    baseLotMax: 160,
    depthLotMin: 5_000,
    depthLotMax: 80_000,
    retailRate: 0.72,
    mediumTradeChance: 0.18,
    wallChance: 0.015,
    specialCooldownMs: 45_000,
    volatility: 0.45,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    depthLevels: 26,
    spreadTicks: [1, 1],
    baseLotMin: 20,
    baseLotMax: 100,
    depthLotMin: 1_000,
    depthLotMax: 25_000,
    retailRate: 0.55,
    mediumTradeChance: 0.14,
    wallChance: 0.025,
    specialCooldownMs: 35_000,
    volatility: 0.8,
  },
  gorengan: {
    id: 'gorengan',
    label: 'Gorengan',
    depthLevels: 26,
    spreadTicks: [1, 3],
    baseLotMin: 5,
    baseLotMax: 55,
    depthLotMin: 100,
    depthLotMax: 8_000,
    retailRate: 0.38,
    mediumTradeChance: 0.22,
    wallChance: 0.07,
    specialCooldownMs: 18_000,
    volatility: 1.8,
  },
  trending: {
    id: 'trending',
    label: 'Trending',
    depthLevels: 26,
    spreadTicks: [1, 2],
    baseLotMin: 15,
    baseLotMax: 90,
    depthLotMin: 3_000,
    depthLotMax: 50_000,
    retailRate: 0.62,
    mediumTradeChance: 0.2,
    wallChance: 0.04,
    specialCooldownMs: 25_000,
    volatility: 1.15,
  },
};

test('market profiles keep the required order, values, and valid parameters', () => {
  assert.deepEqual(Object.keys(ARENA_PROFILES), [
    'liquid',
    'normal',
    'gorengan',
    'trending',
  ]);

  for (const [id, expected] of Object.entries(EXPECTED_PROFILES)) {
    const profile = ARENA_PROFILES[id];
    assert.deepEqual(profile, expected);
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.spreadTicks), true);
    assert.ok(profile.depthLevels >= 8 && profile.depthLevels <= 26);
    assert.equal(profile.spreadTicks.length, 2);
    assert.ok(profile.baseLotMin > 0);
    assert.ok(profile.baseLotMax >= profile.baseLotMin);
    assert.ok(profile.depthLotMin > 0);
    assert.ok(profile.depthLotMax >= profile.depthLotMin);
    assert.ok(profile.wallChance >= 0 && profile.wallChance <= 1);
  }
});

test('speed definitions and delays use supported multipliers with a 25ms floor', () => {
  assert.deepEqual(ARENA_SPEEDS, [1, 2, 5, 10]);
  assert.equal(Object.isFrozen(ARENA_SPEEDS), true);
  assert.equal(speedToDelay(500, 1), 500);
  assert.equal(speedToDelay(500, 2), 250);
  assert.equal(speedToDelay(500, 5), 100);
  assert.equal(speedToDelay(500, '5'), 100);
  assert.equal(speedToDelay(500, 10), 50);
  assert.equal(speedToDelay(500, 99), 500);
  assert.equal(speedToDelay(100, 10), 25);
});

test('seeded Arena RNG repeats the same sequence', () => {
  const first = createArenaRng(12_345);
  const second = createArenaRng(12_345);
  const firstSequence = Array.from({ length: 8 }, () => first());
  const secondSequence = Array.from({ length: 8 }, () => second());

  assert.deepEqual(firstSequence, secondSequence);
  firstSequence.forEach((value) => assert.ok(value >= 0 && value < 1));
});

test('median handles odd, even, empty, and non-finite values', () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([8, 2, 6, 4]), 5);
  assert.equal(median([]), 0);
  assert.equal(median([Infinity, 7, Number.NaN, 3, -Infinity]), 5);
});

test('regime definitions and weighted transitions match the contract', () => {
  assert.deepEqual(ARENA_REGIMES.quiet, {
    id: 'quiet',
    label: 'Quiet',
    minMs: 18_000,
    maxMs: 45_000,
    activity: 0.28,
    aggression: 0.18,
    bias: 0,
    spreadFactor: 1.35,
  });
  assert.deepEqual(ARENA_REGIMES.normal, {
    id: 'normal',
    label: 'Normal',
    minMs: 25_000,
    maxMs: 75_000,
    activity: 0.62,
    aggression: 0.42,
    bias: 0,
    spreadFactor: 1,
  });
  assert.deepEqual(ARENA_REGIMES.trend_up, {
    id: 'trend_up',
    label: 'Trend Up',
    minMs: 20_000,
    maxMs: 60_000,
    activity: 0.72,
    aggression: 0.58,
    bias: 0.28,
    spreadFactor: 1.05,
  });
  assert.deepEqual(ARENA_REGIMES.trend_down, {
    id: 'trend_down',
    label: 'Trend Down',
    minMs: 20_000,
    maxMs: 60_000,
    activity: 0.72,
    aggression: 0.58,
    bias: -0.28,
    spreadFactor: 1.05,
  });
  assert.deepEqual(ARENA_REGIMES.volatile, {
    id: 'volatile',
    label: 'Volatile',
    minMs: 12_000,
    maxMs: 35_000,
    activity: 0.88,
    aggression: 0.72,
    bias: 0,
    spreadFactor: 1.45,
  });
  assert.deepEqual(ARENA_REGIMES.panic_buy, {
    id: 'panic_buy',
    label: 'Panic Buy',
    minMs: 7_000,
    maxMs: 18_000,
    activity: 0.96,
    aggression: 0.9,
    bias: 0.68,
    spreadFactor: 1.7,
  });
  assert.deepEqual(ARENA_REGIMES.panic_sell, {
    id: 'panic_sell',
    label: 'Panic Sell',
    minMs: 7_000,
    maxMs: 18_000,
    activity: 0.96,
    aggression: 0.9,
    bias: -0.68,
    spreadFactor: 1.7,
  });

  assert.deepEqual(REGIME_TRANSITIONS, {
    quiet: [['normal', 1]],
    normal: [
      ['quiet', 0.28],
      ['trend_up', 0.22],
      ['trend_down', 0.22],
      ['volatile', 0.28],
    ],
    trend_up: [
      ['normal', 0.45],
      ['volatile', 0.35],
      ['panic_buy', 0.2],
    ],
    trend_down: [
      ['normal', 0.45],
      ['volatile', 0.35],
      ['panic_sell', 0.2],
    ],
    volatile: [
      ['normal', 0.46],
      ['trend_up', 0.18],
      ['trend_down', 0.18],
      ['panic_buy', 0.09],
      ['panic_sell', 0.09],
    ],
    panic_buy: [['volatile', 1]],
    panic_sell: [['volatile', 1]],
  });
});

test('regime controller never transitions before the minimum duration', () => {
  const controller = createRegimeController({
    rng: () => 0,
    initial: 'normal',
    now: 1_000,
  });

  assert.equal(controller.get().expiresAt, 26_000);
  assert.equal(controller.advance(25_999), false);
  assert.equal(controller.get().id, 'normal');
  assert.equal(controller.advance(26_000), true);
});

test('regime duration includes its exact minimum and maximum bounds', () => {
  const minimum = createRegimeController({
    rng: createSequenceRng([0]),
    initial: 'normal',
    now: 500,
  });
  const maximum = createRegimeController({
    rng: createSequenceRng([1 - Number.EPSILON]),
    initial: 'normal',
    now: 500,
  });

  assert.equal(minimum.get().expiresAt, 500 + ARENA_REGIMES.normal.minMs);
  assert.equal(maximum.get().expiresAt, 500 + ARENA_REGIMES.normal.maxMs);
});

test('normal regime uses exact weighted transition boundaries', () => {
  const cases = [
    { boundary: 0.28 - Number.EPSILON, expected: 'quiet' },
    { boundary: 0.28, expected: 'trend_up' },
    { boundary: 0.5, expected: 'trend_down' },
    { boundary: 0.72, expected: 'volatile' },
  ];

  for (const { boundary, expected } of cases) {
    const controller = createRegimeController({
      rng: createSequenceRng([0, boundary, 0]),
      initial: 'normal',
      now: 0,
    });

    assert.equal(controller.advance(ARENA_REGIMES.normal.minMs), true);
    assert.equal(controller.get().id, expected);
    assert.equal(controller.get().enteredAt, ARENA_REGIMES.normal.minMs);
    assert.equal(
      controller.get().expiresAt,
      ARENA_REGIMES.normal.minMs + ARENA_REGIMES[expected].minMs,
    );
  }
});

test('panic regimes transition only to volatile after expiry', () => {
  for (const initial of ['panic_buy', 'panic_sell']) {
    const controller = createRegimeController({
      rng: createArenaRng(987),
      initial,
      now: 0,
    });
    const before = controller.get();

    assert.equal(controller.advance(before.expiresAt - 1), false);
    assert.equal(controller.advance(before.expiresAt), true);
    assert.equal(controller.get().id, 'volatile');
  }
});

test('controllers with the same seed produce identical regimes and timing', () => {
  const first = createRegimeController({ rng: createArenaRng(44), now: 500 });
  const second = createRegimeController({ rng: createArenaRng(44), now: 500 });

  for (let index = 0; index < 10; index += 1) {
    assert.deepEqual(first.get(), second.get());
    const expiry = first.get().expiresAt;
    assert.equal(first.advance(expiry), second.advance(expiry));
  }
});

test('fixed regime controller never advances and falls back to normal', () => {
  const fixed = createFixedRegimeController('trend_up');
  assert.deepEqual(fixed.get(), {
    ...ARENA_REGIMES.trend_up,
    enteredAt: 0,
    expiresAt: Infinity,
  });
  assert.equal(fixed.advance(Number.MAX_SAFE_INTEGER), false);
  assert.equal(fixed.get().id, 'trend_up');

  const fallback = createFixedRegimeController('missing');
  assert.equal(fallback.get().id, 'normal');
});

test('inherited object keys are rejected as regime and profile identifiers', () => {
  for (const inheritedId of ['toString', 'constructor']) {
    const dynamic = createRegimeController({
      rng: () => 0,
      initial: inheritedId,
      now: 100,
    });
    assert.equal(dynamic.get().id, 'normal');
    assert.equal(
      dynamic.get().expiresAt,
      100 + ARENA_REGIMES.normal.minMs,
    );

    const fixed = createFixedRegimeController(inheritedId);
    assert.equal(fixed.get().id, 'normal');
  }

  assert.deepEqual(normalizeArenaPreferences({
    profile: 'toString',
    speed: 1,
  }), {
    profile: 'normal',
    speed: 1,
  });
});

test('Arena preferences retain valid values and normalize invalid input', () => {
  assert.deepEqual(normalizeArenaPreferences({
    profile: 'gorengan',
    speed: '5',
  }), {
    profile: 'gorengan',
    speed: 5,
  });

  assert.deepEqual(normalizeArenaPreferences({
    profile: 'missing',
    speed: 3,
  }), {
    profile: 'normal',
    speed: 1,
  });

  assert.deepEqual(normalizeArenaPreferences(), {
    profile: 'normal',
    speed: 1,
  });

  for (const input of [null, 'invalid', 42, false]) {
    assert.deepEqual(normalizeArenaPreferences(input), {
      profile: 'normal',
      speed: 1,
    });
  }
});
