import fastify from "fastify";
// import { checkLimit } from "./limiter.js";
import { redis } from "./redis.js";
import { error } from "node:console";
import { policies } from "./policies.js";
import {readFile} from 'node:fs/promises';
import { ScriptRunner, checkLimit } from "./runner.js";

const app= fastify({logger: true});

const scripts: Record<string, string> = {
  'fixed-window': await readFile('src/lua/fixed-window.lua', 'utf8'),
  'token-bucket': await readFile('src/lua/token-bucket.lua', 'utf8'),
  'sliding-window': await readFile('src/lua/sliding-window-counter.lua', 'utf8'),
  'leaky-bucket': await readFile('src/lua/leaky-bucket.lua', 'utf8'),
};
const runner = new ScriptRunner(redis, scripts);
await runner.loadAll();

app.get('/health', async()=>({ok:true}));

app.post<{Body:{subject?:string; policyId?:string; cost?:number}}>('/v1/check', async (request,reply)=>{
    const subject = request.body?.subject;
    const policyId = request.body?.policyId;
    const cost = request.body?.cost ?? 1;

    if (!subject || subject.length > 200) {
        return reply.code(400).send({ error: 'subject is required' });
    }
    if (!policyId) {
        return reply.code(400).send({ error: 'policyId is required' });
    }
    const policy = policies[policyId];
    if (!policy) {
        return reply.code(404).send({ error: 'unknown policy' });
    }

    const maxCost =
        policy.algorithm === 'token_bucket' || policy.algorithm === 'leaky_bucket'
            ? policy.capacity
            : policy.limit;
    if (!Number.isInteger(cost) || cost < 1 || cost > maxCost) {
        return reply.code(400).send({ error: 'invalid cost' });
    }

    const key = `rl:${policyId}:${subject}`;
    const result = await checkLimit(runner, key, policy, cost);
    return { ...result, algorithm: policy.algorithm };
});



const shutdown=async ()=>{
    await app.close();
    await redis.quit();
};

process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);

await app.listen({port:3000, host:'0.0.0.0'});