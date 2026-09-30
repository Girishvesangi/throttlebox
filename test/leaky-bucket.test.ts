import { readFile } from 'node:fs/promises';
import { beforeEach, afterAll, expect, test } from 'vitest';
import { redis } from '../src/redis.js';

const script = await readFile('src/lua/leaky-bucket.lua', 'utf8');

async function check(subject: string, capacity = 5, leakPerSecond = 1, cost = 1) {
  const raw = (await redis.eval(script, 1, `lkb:${subject}`, capacity, leakPerSecond, cost)) as number[];
  return { allowed: raw[0] === 1, remaining: raw[2], retryAfterMs: raw[4] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  const keys = await redis.keys('lkb:*');
  if (keys.length > 0) await redis.del(...keys);
});
afterAll(async () => { await redis.quit(); });

test('accepts until backlog reaches capacity, then denies', async () => {
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await check('b1', 5, 0.1));
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
});

test('backlog drains at the leak rate', async () => {
  for (let i = 0; i < 10; i++) await check('b2', 10, 1);
  await sleep(3000); // drains ~3, level ~7
  const results = [];
  for (let i = 0; i < 10; i++) results.push(await check('b2', 10, 1));
  const allowed = results.filter((r) => r.allowed).length;
  expect(allowed).toBeGreaterThan(0);
  expect(allowed).toBeLessThan(10);
});

test('backlog never goes negative; long idle empties the bucket', async () => {
  for (let i = 0; i < 5; i++) await check('b3', 5, 10);
  await sleep(1500); // would drain 15, but level floors at 0
  const r = await check('b3', 5, 10);
  expect(r.allowed).toBe(true);
  expect(r.remaining).toBe(4); // level was 0, not -10
});

test('denied requests do not add to backlog', async () => {
  for (let i = 0; i < 3; i++) await check('b4', 3, 1);
  await check('b4', 3, 1); // denied: bucket full
  await check('b4', 3, 1); // denied: bucket full
  await sleep(3500); // drains the 3 real requests, with margin
  const results = [];
  for (let i = 0; i < 3; i++) results.push(await check('b4', 3, 1));
  // all 3 fit again only if the 2 denials added nothing
  expect(results.filter((r) => r.allowed)).toHaveLength(3);
});

test('long idle returns the bucket to empty', async () => {
  for (let i = 0; i < 5; i++) await check('b5', 5, 1);
  await sleep(6000); // drains 6 > capacity 5
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await check('b5', 5, 1));
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
}, 15000);

test('concurrency: accepted cost never exceeds capacity', async () => {
  const results = await Promise.all(
    Array.from({ length: 50 }, () => check('b6', 5, 1)),
  );
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
});
