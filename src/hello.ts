import {redis} from './redis.js';

await redis.set('demo:name','ThrottleBox');
console.log(await redis.get('demo:name'));
await redis.quit();