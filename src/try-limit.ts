import { checkLimit } from "./limiter.js";
import { redis } from "./redis.js";

for (let i=1;i<=5;i++){
    console.log(i,await checkLimit('user-42'));
}

await redis.quit();