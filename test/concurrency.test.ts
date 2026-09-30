import { beforeEach, afterAll, expect, test } from "vitest";
import { checkLimit } from "../src/limiter.js";
import {redis} from '../src/redis.js';

beforeEach(async()=>{
    await redis.flushdb();
})

afterAll(async()=>{
    await redis.quit();
})

test('only three simultaneous requests are allowed', async()=>{
    const results=await Promise.all(
        Array.from(
            {length:100},
            ()=>checkLimit('same-user',3,60_000),
        ),
    );
    const allowed=results.filter((result)=>result.allowed);
    expect(allowed).toHaveLength(3);
})