import { beforeEach, afterAll, expect, test } from "vitest";
import { readFile } from 'node:fs/promises';
import { ScriptRunner, checkLimit } from "../src/runner.js";
import { redis } from '../src/redis.js';

const runner = new ScriptRunner(redis, {
  'fixed-window': await readFile('src/lua/fixed-window.lua', 'utf8'),
});
await runner.loadAll();

beforeEach(async () => {
  const keys = await redis.keys('ccr:*');
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  await redis.quit();
});

test('only three simultaneous requests are allowed', async () => {
  const policy = { id: 'test-concurrency', algorithm: 'fixed_window' as const, limit: 3, windowMs: 60_000 };

  const results = await Promise.all(
    Array.from({ length: 100 }, () =>
      checkLimit(runner, 'ccr:test', policy, 1),
    ),
  );
  const allowed = results.filter((result) => result.allowed);
  expect(allowed).toHaveLength(3);
});
