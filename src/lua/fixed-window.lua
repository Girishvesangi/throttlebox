local limit= tonumber(ARGV[1])
local window_ms=tonumber(ARGV[2])

local time=redis.call('TIME')
local now_ms=tonumber(time[1])*1000+math.floor(tonumber(time[2])/1000)
local window_number=math.floor(now_ms/window_ms)
local reset_at_ms=(window_number+1)*window_ms

local saved_window=tonumber(redis.call('HGET',KEYS[1],'window'))
local count=tonumber(redis.call('HGET',KEYS[1],'count')) or 0

if saved_window==nil or saved_window~=window_number then
    count=0
end

local allowed=0
if count<limit then
    count=count+1
    allowed=1
end

redis.call('HSET', KEYS[1], 'window', window_number, 'count', count)
redis.call('PEXPIRE',KEYS[1],window_ms*2)

local remaining =math.max(0,limit-count)
local retry_after_ms=0

if allowed ==0 then
    retry_after_ms= reset_at_ms -now_ms
end

return {allowed,limit, remaining, reset_at_ms, retry_after_ms}