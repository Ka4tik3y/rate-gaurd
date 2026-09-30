local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = redis.call('TIME')
local now_ms = now[1] * 1000 + math.floor(now[2] / 1000)
local tokens = tonumber(redis.call('HGET', KEYS[1], 'tokens'))
local last_ms = tonumber(redis.call('HGET', KEYS[1], 'timestamp'))
if not tokens then tokens = capacity end
if not last_ms then last_ms = now_ms end
local elapsed = math.max(0, now_ms - last_ms) / 1000
tokens = math.min(capacity, tokens + (elapsed * refill_rate))
local allowed = 0
local retry_after = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_after = math.max(1, math.ceil((1 - tokens) / refill_rate))
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'timestamp', now_ms)
redis.call('EXPIRE', KEYS[1], math.max(1, math.ceil((capacity / refill_rate) * 2)))
return {allowed, math.floor(tokens), retry_after, math.floor(tokens)}
