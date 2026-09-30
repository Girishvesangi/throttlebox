local capacity=tonumber(ARGV[1])
local leak_rate = tonumber(ARGV[2])
local cost=tonumber(ARGV[3])

local t= redis.call('TIME')
local now_ms= tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local level =tonumber(redis.call('HGET',KEYS[1],'level')) or 0
local last_ms=tonumber(redis.call('HGET',KEYS[1],'last_ms')) or now_ms

local elapsed_ms=math.max(0,now_ms-last_ms)
level=math.max(0,level-(elapsed_ms/1000.0)*leak_rate)

local allowed=0
if level +cost<=capacity then
    level=level+cost
    allowed=1
end

redis.call('HSET', KEYS[1],'level', level,'last_ms', now_ms)
local idle_ttl_ms= math.ceil((capacity/leak_rate)*2000)
redis.call('PEXPIRE',KEYS[1],math.max(1000,idle_ttl_ms))

local overflow = math.max(0, level + cost - capacity)
local retry_after = allowed == 1 and 0 or math.ceil((overflow / leak_rate) * 1000)
local empty_after = math.ceil((level / leak_rate) * 1000)
local remaining = math.max(0, math.floor(capacity - level))
return {allowed, capacity, remaining, now_ms + empty_after, retry_after}