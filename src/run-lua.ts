import {readFile} from 'node:fs/promises'
import {redis} from './redis.js';

const script=await readFile('src/lua/increment.lua','utf8');
const result=await redis.eval(script,1,'demo:counter');

console.log({result})
await redis.quit();
