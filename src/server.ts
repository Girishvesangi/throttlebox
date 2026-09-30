import fastify from "fastify";
import { checkLimit } from "./limiter.js";
import { redis } from "./redis.js";
import { error } from "node:console";
import { policies } from "./policies.js";

const app= fastify({logger: true});

app.get('/health', async()=>({ok:true}));

app.post<{Body:{subject?:string; policyId?:string}}>('/v1/check', async (request,reply)=>{
    const subject=request.body?.subject;
    const policyId=request.body?.policyId;

    if(!subject || subject.length>200){
        return reply.code(400).send({error:'subject is required'});

    }
    const policy=policyId? policies[policyId]:undefined;
    if(!policy){
        return reply.code(404).send({error:'unknown policy'});
    }
    return checkLimit(`${policyId}:${subject}`,policy.limit,policy.windowMs);
});

const shutdown=async ()=>{
    await app.close();
    await redis.quit();
};

process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);

await app.listen({port:3000, host:'0.0.0.0'});