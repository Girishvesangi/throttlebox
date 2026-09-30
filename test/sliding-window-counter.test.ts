import { readFile } from 'node:fs/promises';
import { beforeEach, afterAll, expect, test } from 'vitest';
import { redis } from '../src/redis.js';

const script = await readFile('src/lua/sliding-window-counter.lua', 'utf8');

async function check(subject: string, limit = 5, windowMs = 2000, cost = 1) {
  const raw = (await redis.eval(script, 1, `swc:${subject}`, limit, windowMs, cost)) as number[];
  return { allowed: raw[0] === 1, remaining: raw[2], retryAfterMs: raw[4] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ms until we are `offsetMs` into the next window — makes timing tests deterministic
async function msToNextWindow(windowMs: number, offsetMs: number) {
  const t = await redis.time();
  const nowMs = Number(t[0]) * 1000 + Math.floor(Number(t[1]) / 1000);
  return windowMs - (nowMs % windowMs) + offsetMs;
}

beforeEach(async () => {
  const keys = await redis.keys('swc:*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => { await redis.quit(); });

test('blocks the fixed-window boundary burst',{timeout:15000}, async () => {
  const windowMs = 2000, limit = 10;
  await sleep(await msToNextWindow(windowMs, 100)); // ~100ms into window W
  for (let i = 0; i < 10; i++) {
    expect((await check('b1', limit, windowMs)).allowed).toBe(true);
  }
  await sleep(await msToNextWindow(windowMs, 100)); // ~100ms into window W+1
  // prev=10 still weighs 95%: estimated=9.5, so all 10 are denied.
  // Fixed window would have allowed all 10 here.
  const results = [];
  for (let i = 0; i < 10; i++) results.push(await check('b1', limit, windowMs));
  expect(results.filter((r) => r.allowed)).toHaveLength(0);
});

test('previous window contributes ~50% halfway through',{timeout:20000}, async () => {
  const windowMs = 6000, limit = 10;
  await sleep(await msToNextWindow(windowMs, 150));
  for (let i = 0; i < 4; i++) await check('b2', limit, windowMs);
  await sleep(await msToNextWindow(windowMs, 150)); // roll into next window, prev=4
  await sleep(2850); // ~50% through the window -> weight ~0.5, estimated ~2.0
  const results = [];
  for (let i = 0; i < 10; i++) results.push(await check('b2', limit, windowMs));
  // 10 - 2.0 = 8 requests fit
  expect(results.filter((r) => r.allowed)).toHaveLength(8);
});

test('skipping two windows resets usage to zero', async () => {
  for (let i = 0; i < 3; i++) await check('b3', 5, 2000);
  await sleep(4500); // crosses at least two 2s boundaries from any alignment
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await check('b3', 5, 2000));
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
});

test('concurrency: accepted cost never exceeds the limit', async () => {
  const results = await Promise.all(
    Array.from({ length: 50 }, () => check('b4', 5, 60_000)),
  );
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
});
