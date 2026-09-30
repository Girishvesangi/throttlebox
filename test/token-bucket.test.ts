import { readFile } from 'node:fs/promises';
import { beforeEach, afterAll, expect, test } from 'vitest';
import { redis } from '../src/redis.js';

const script = await readFile('src/lua/token-bucket.lua', 'utf8');

async function check(subject: string, capacity = 5, refillPerSec = 5, cost = 1) {
  const raw = (await redis.eval(script, 1, `tkb:${subject}`, capacity, refillPerSec, cost)) as number[];
  return { allowed: raw[0] === 1, remaining: raw[2], retryAfterMs: raw[4] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  const keys = await redis.keys('tkb:*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => { await redis.quit(); });

test('burst of capacity allowed, then denied', async () => {
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await check('u1'));
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
  expect(results[5].allowed).toBe(false);
});

test('denied request consumes nothing; bucket refills over time', async () => {
  for (let i = 0; i < 5; i++) await check('u2');
  expect((await check('u2')).allowed).toBe(false);
  await sleep(1100);
  expect((await check('u2')).allowed).toBe(true);
});

test('concurrency: exactly capacity wins', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => check('u3')));
  expect(results.filter((r) => r.allowed)).toHaveLength(5);
});
