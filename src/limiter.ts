import {readFile} from 'node:fs/promises';
import {redis } from './redis.js';

const script=await readFile('src/lua/fixed-window.lua','utf8')

export type LimitResult={
    allowed: boolean;
    remaining: number;
    resetAtMs: number;
    retryAfterMs: number;
};

export async function checkLimit(
    subject: string,
    limit=3,
    windowMs= 10_000,
):Promise<LimitResult>{
    const raw= await redis.eval(
        script,
        1,
        `tb:${subject}`,
        limit,
        windowMs,
    ) as number[];

    return {
        allowed: raw[0]===1,
        remaining: raw[1],
        resetAtMs: raw[2],
        retryAfterMs: raw[3],
    };
}