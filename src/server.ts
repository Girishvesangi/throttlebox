import fastify from "fastify";
import { checkLimit } from "./limiter.js";
import { redis } from "./redis.js";
import { error } from "node:console";

const app= fastify({logger: true});

app.get('/health', async()=>({ok:true}));

app.post<{Body:{subject?:string}}>('/v1/check', async (request,reply)=>{
    const subject=request.body?.subject;

    if(!subject || subject.length>200){
        return reply.code(400).send({error:'subject is required'});

    }
    return checkLimit(subject);
});

const shutdown=async ()=>{
    await app.close();
    await redis.quit();
};

process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);

await app.listen({port:3000, host:'0.0.0.0'});