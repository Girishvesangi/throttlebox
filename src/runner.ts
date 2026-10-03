import {Redis} from 'ioredis';
import type { Policy } from './policies.js';

export interface RateLimitResult{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAtMs: number;
    retryAfterMs: number;
}





function decode(raw:unknown): RateLimitResult{
    const[allowed,limit,remaining,resetAtMs, retryAfterMs]=raw as [number,number,number,number,number];
    return {allowed:allowed===1,limit,remaining,resetAtMs,retryAfterMs};

}

export class ScriptRunner{
    private readonly sha=new Map<string,string>();
    constructor(
        private readonly redis: Redis,
        private readonly scripts: Record<string,string>,
    ){}

    private scriptLoad(body: string): Promise<string> {
    const redis = this.redis as unknown as { script(command: 'LOAD', script: string): Promise<string> };
    return redis.script('LOAD', body);
}



    async loadAll():Promise<void>{
        for(const [name,body] of Object.entries(this.scripts)){
            this.sha.set(name,(await this.scriptLoad(body)));
        }
    }

    async run(name: string, key: string, args: Array<string |number>): Promise<RateLimitResult>{
        const execute=()=>
            this.redis.evalsha(this.sha.get(name)!,1,key,...args.map(String));
        try{
            return decode(await execute());
        }
        catch(error){
            if(!String(error).includes('NOSCRIPT')) throw error;
            const body=this.scripts[name];
            if(body===undefined) throw error;
            this.sha.set(name, (await this.scriptLoad(body)));
            return decode(await execute());
        }
    }
}

export async function checkLimit(
    runner: ScriptRunner,
    key:string,
    policy:Policy,
    cost:number,
): Promise<RateLimitResult>{
    switch (policy.algorithm){
        case 'fixed_window':
            return runner.run('fixed-window',key,[policy.limit,policy.windowMs,cost]);
        case 'sliding_window':
            return runner.run('sliding-window', key, [policy.limit, policy.windowMs, cost]);
        case 'token_bucket':
            return runner.run('token-bucket', key, [policy.capacity, policy.refillPerSecond, cost]);
        case 'leaky_bucket':
            return runner.run('leaky-bucket', key, [policy.capacity, policy.leakPerSecond, cost]);
  }
}  
