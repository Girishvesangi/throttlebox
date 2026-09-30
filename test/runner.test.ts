import { readFile } from 'node:fs/promises';
import { beforeEach, afterAll, expect, test } from 'vitest';
import { redis } from '../src/redis.js';
import { ScriptRunner, checkLimit } from '../src/runner.js';
import type { Policy } from '../src/policies.js';

const scripts: Record<string, string> = {
  'fixed-window': await readFile('src/lua/fixed-window.lua', 'utf8'),
  'token-bucket': await readFile('src/lua/token-bucket.lua', 'utf8'),
  'sliding-window': await readFile('src/lua/sliding-window-counter.lua', 'utf8'),
  'leaky-bucket': await readFile('src/lua/leaky-bucket.lua', 'utf8'),
};
const runner = new ScriptRunner(redis, scripts);
await runner.loadAll();

beforeEach(async () => {
  const keys = await redis.keys('rkb:*');
  if (keys.length > 0) await redis.del(...keys);
});
afterAll(async () => { await redis.quit(); });

const cases: Array<{ name: string; policy: Policy }> = [
  { name: 'fixed_window', policy: { id: 't', algorithm: 'fixed_window', limit: 2, windowMs: 60_000 } },
  { name: 'sliding_window', policy: { id: 't', algorithm: 'sliding_window', limit: 2, windowMs: 60_000 } },
  { name: 'token_bucket', policy: { id: 't', algorithm: 'token_bucket', capacity: 2, refillPerSecond: 0.1 } },
  { name: 'leaky_bucket', policy: { id: 't', algorithm: 'leaky_bucket', capacity: 2, leakPerSecond: 0.1 } },
];

for (const { name, policy } of cases) {
  test(`runner dispatches ${name}: 2 allowed, 3rd denied`, async () => {
    const key = `rkb:${name}`;
    expect((await checkLimit(runner, key, policy, 1)).allowed).toBe(true);
    expect((await checkLimit(runner, key, policy, 1)).allowed).toBe(true);
    const third = await checkLimit(runner, key, policy, 1);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });
}

test('runner survives a Redis script flush (NOSCRIPT reload)', async () => {
  const policy: Policy = { id: 't', algorithm: 'fixed_window', limit: 5, windowMs: 60_000 };
  await redis.script('FLUSH'); // Redis forgets all scripts, like after a restart
  const r = await checkLimit(runner, 'rkb:noscr', policy, 1);
  expect(r.allowed).toBe(true);
});
