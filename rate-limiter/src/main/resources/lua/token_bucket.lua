-- Atomic token-bucket consume with per-client policy override and temporary block.
-- KEYS[1] = bucket hash           rl:bucket:{clientId}
-- KEYS[2] = override hash          policy:override:{clientId}  (optional fields: capacity, refillRate)
-- KEYS[3] = block key             policy:block:{clientId}     (existence = blocked; TTL = remaining)
-- ARGV[1] = default capacity
-- ARGV[2] = default refill rate (tokens/sec)
-- Returns: {allowed, remaining, retryAfter, currentTokens, blocked, effectiveCapacity}

local default_capacity = tonumber(ARGV[1])
local default_refill = tonumber(ARGV[2])

-- Effective policy: override if present, else default.
local capacity = tonumber(redis.call('HGET', KEYS[2], 'capacity')) or default_capacity
local refill_rate = tonumber(redis.call('HGET', KEYS[2], 'refillRate')) or default_refill
if refill_rate == nil or refill_rate <= 0 then refill_rate = default_refill end
if refill_rate == nil or refill_rate <= 0 then refill_rate = 1 end

-- Temporary block short-circuits the bucket entirely.
if redis.call('EXISTS', KEYS[3]) == 1 then
  local ttl = redis.call('PTTL', KEYS[3])
  local retry = 1
  if ttl and ttl > 0 then retry = math.ceil(ttl / 1000) end
  return {0, 0, retry, 0, 1, math.floor(capacity)}
end

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
return {allowed, math.floor(tokens), retry_after, math.floor(tokens), 0, math.floor(capacity)}
