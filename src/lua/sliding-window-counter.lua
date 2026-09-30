-- ARGV[1] limit, ARGV[2] window_ms, ARGV[3] cost
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])

local t = redis.call('TIME')
local now_ms = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = math.floor(now_ms / window_ms)
local elapsed = now_ms - (window * window_ms)

local old_window = tonumber(redis.call('HGET', KEYS[1], 'window'))
local curr = tonumber(redis.call('HGET', KEYS[1], 'curr')) or 0
local prev = tonumber(redis.call('HGET', KEYS[1], 'prev')) or 0

if old_window == nil then
  curr, prev = 0, 0
elseif window == old_window + 1 then
  prev, curr = curr, 0
elseif window > old_window + 1 or window < old_window then
  prev, curr = 0, 0
end

local previous_weight = (window_ms - elapsed) / window_ms
local estimated = curr + (prev * previous_weight)
local allowed = 0
if estimated + cost <= limit then
  curr = curr + cost
  estimated = estimated + cost
  allowed = 1
end

redis.call('HSET', KEYS[1], 'window', window, 'curr', curr, 'prev', prev)
redis.call('PEXPIRE', KEYS[1], window_ms * 3)

local remaining = math.max(0, math.floor(limit - estimated))
local retry_after = 0
if allowed == 0 then
  local left = window_ms - elapsed
  local needed_drop = estimated + cost - limit
  if prev > 0 and math.ceil((needed_drop * window_ms) / prev) <= left then
    retry_after = math.max(1, math.ceil((needed_drop * window_ms) / prev))
  elseif curr + cost <= limit then
    retry_after = left
  elseif curr > 0 then
    retry_after = left + math.ceil(((curr + cost - limit) * window_ms) / curr)
  else
    retry_after = left
  end
end
-- By the start of the window after next, both stored windows have aged out.
local reset_at = (window + 2) * window_ms
return {allowed, limit, remaining, reset_at, retry_after}
