local capacity=tonumber(ARGV[1])
local refill_rate=tonumber(ARGV[2])
local cost=tonumber(ARGV[3])

local t=redis.call('TIME')
local now_ms=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local tokens=tonumber(redis.call('HGET',KEYS[1],'tokens'))
local last_ms=tonumber(redis.call('HGET',KEYS[1],'last_ms'))
if tokens==nil then tokens=capacity end
if last_ms==nil then last_ms=now_ms end

local elapsed_ms =math.max(0,now_ms-last_ms)
tokens=math.min(capacity,tokens+(elapsed_ms/1000.0)*refill_rate)

local allowed=0
if tokens >= cost then
    tokens=tokens-cost
    allowed=1
end

redis.call('HSET',KEYS[1],'tokens',tokens,'last_ms',now_ms)
local idle_ttl_ms=math.ceil((capacity/refill_rate)*2000)
redis.call('PEXPIRE',KEYS[1],math.max(1000,idle_ttl_ms))

local missing=math.max(0,cost-tokens)
local retry_after=allowed==1 and 0 or math.ceil((missing/refill_rate)*1000)
local full_after=math.ceil(((capacity-tokens)/refill_rate)*1000)
return {allowed,capacity,math.floor(tokens),now_ms+full_after,retry_after}