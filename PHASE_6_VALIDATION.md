# Phase 6 Validation Guide

## Overview

Phase 6 implements rate limiting in the Worker using BullMQ's `moveToDelayed()` mechanism. This document explains how to validate all 10 test scenarios.

## Prerequisites

```bash
# Start Redis (required for integration tests)
redis-server

# Install dependencies in worker package
cd apps/worker
npm install
```

## Running Tests

### Unit Tests
```bash
npm run test
```

### Run Tests Once (CI mode)
```bash
npm run test:run
```

### With Coverage
```bash
npm run test:coverage
```

## Test Scenarios

### Test 1: Rate-limited job is rescheduled
**File:** `src/__tests__/integration.rate-limit.test.ts` > "Scenario 1"

**What it validates:**
- Request 1 & 2 are allowed (2 req/sec limit)
- Request 3 is blocked with `delayMs > 0`

**Manual test:**
```bash
# Create two requests quickly, third should be delayed
curl -X POST http://localhost:3001/api/requests \
  -H "Content-Type: application/json" \
  -d '{"destinationId":"test","payload":{}}'

# Call three times in quick succession, third will get delayMs
```

**Expected result:**
- ✅ First two return immediately
- ✅ Third returns `{ error: "Rate limited", delayMs: <ms> }`

---

### Test 2: No HTTP request while rate-limited
**File:** `src/__tests__/integration.rate-limit.test.ts`

**What it validates:**
- When processor returns `delayMs > 0`, worker doesn't call HTTP
- RequestProcessor returns before axios call

**Manual validation:**
```bash
# In worker logs, you should see:
# "Job rate-limited, rescheduling with delay" 
# (NOT "Request sent" or HTTP status log)

# In request_attempts table, no row created for delayed job
```

**Expected result:**
- ✅ No HTTP call made
- ✅ No attempt recorded in DB
- ✅ Job moved to delayed state

---

### Test 3: Concurrency slot released before delay
**File:** `src/__tests__/integration.rate-limit.test.ts` > "Scenario 4"

**What it validates:**
- `concurrencyManager.release()` called BEFORE `job.moveToDelayed()`
- Slot counter decremented before job waits

**Code inspection:**
```typescript
// In worker.ts, the order is:
1. Processor returns with delayMs
2. moveToDelayed() called (slot already released by processor in finally block)
3. Return without throwing (don't consume retry attempt)
```

**Manual verification with Redis:**
```bash
# Before delay:
redis-cli GET "concurrency:in_progress:dest-1"
# Should show 0, not 1 or more

# After delay expires and job reactivated:
# Should be able to acquire slot immediately if not rate-limited anymore
```

**Expected result:**
- ✅ `concurrency:in_progress:{dest}` = 0
- ✅ Job not consuming slot during delay

---

### Test 4: Rescheduled jobs not duplicated
**File:** `src/__tests__/integration.rate-limit.test.ts`

**What it validates:**
- `moveToDelayed()` doesn't create new job
- Job ID stays same after delay

**Manual test:**
```bash
# Submit job with ID "test-123"
curl -X POST http://localhost:3001/api/requests \
  -H "Content-Type: application/json" \
  -d '{"requestId":"test-123",...}'

# Check BullMQ queue
redis-cli
> SMEMBERS "bull:requests:jobs"

# Should show "test-123" once, not duplicated after delay
```

**Expected result:**
- ✅ Only one job ID in queue
- ✅ Job rescheduled, not cloned

---

### Test 5: Rate-limit delays not counted as HTTP attempts
**File:** `src/__tests__/integration.rate-limit.test.ts`

**What it validates:**
- When job is rate-limited and delayed, `request_attempts` table NOT updated
- Only real HTTP calls increment `attempts` counter

**Manual verification:**
```bash
# Query DB after rate-limited job
SELECT * FROM request_attempts WHERE request_id = 'test-123';

# Should be EMPTY if job was only delayed, not sent
# Should have 1 row if an actual HTTP call was made
```

**Expected result:**
- ✅ No `request_attempts` row for rate-limited jobs
- ✅ HTTP attempts only recorded for actual calls

---

### Test 6: Redis offline causes delay + no HTTP
**File:** `src/__tests__/integration.rate-limit.test.ts` > "Scenario 7"

**What it validates:**
- Fail-closed behavior when Redis unavailable
- Job delayed (not errored), no HTTP sent

**Manual test:**
```bash
# Stop Redis
redis-cli SHUTDOWN

# Submit request
curl -X POST http://localhost:3001/api/requests \
  -H "Content-Type: application/json" \
  -d '{...}'

# Worker should:
# 1. Catch Redis error
# 2. Not call HTTP
# 3. Reschedule with 30s delay (fail-closed)
# 4. Log "redis_unavailable" reason
```

**Restart Redis:**
```bash
redis-server
```

**Expected result:**
- ✅ No HTTP call attempted
- ✅ Worker logs redis_unavailable
- ✅ Job rescheduled (not failed)
- ✅ After Redis restarts, job retries

---

### Test 7: Jitter prevents thundering herd
**File:** `src/__tests__/integration.rate-limit.test.ts` > "Scenario 6"

**What it validates:**
- Multiple jobs with same delay have staggered retry times
- Backoff calculator includes random jitter (0.5-1.5x multiplier)

**Manual test:**
```bash
# Submit 10 requests to same destination quickly
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/requests \
    -H "Content-Type: application/json" \
    -d "{\"requestId\":\"test-$i\",...}" &
done

# Check Redis delayed keys
redis-cli KEYS "bull:requests:delayed:*"

# Verify retry times are spread (not all same timestamp)
# Job retry times should differ by jitter: ±50% of base delay
```

**Expected result:**
- ✅ Jobs have different retry times
- ✅ No simultaneous retry thundering
- ✅ Jitter spread: base * (0.5-1.5)

---

### Test 8: HTTP 429 respects Retry-After
**File:** `src/__tests__/integration.rate-limit.test.ts`

**What it validates:**
- When destination returns HTTP 429
- `Retry-After` header parsed and respected
- Job rescheduled with that delay
- Slot released
- Attempt IS recorded (actual HTTP call happened)

**Manual test with mock 429 server:**
```bash
# Use a destination that returns 429 with Retry-After: 120
# Example: http://httpbin.org/status/429

# Submit request
curl -X POST http://localhost:3001/api/requests \
  -H "Content-Type: application/json" \
  -d '{"destinationId":"dest-429",...}'

# Verify:
# 1. HTTP attempt recorded in request_attempts
# 2. Job rescheduled with ~120s delay
# 3. Logs show "retry_after" reason
```

**Expected result:**
- ✅ HTTP call made (attempt recorded)
- ✅ Retry-After parsed correctly
- ✅ Job delayed by specified duration
- ✅ Slot released
- ✅ Job not marked as failed

---

### Test 9: HTTP 500 follows retry policy
**File:** `src/__tests__/integration.rate-limit.test.ts` > "Scenario 10"

**What it validates:**
- HTTP 500 is retryable (via BullMQ built-in retry)
- Exponential backoff applied (not confused with rate limiting)
- Attempt recorded
- Not treated as rate-limit delay

**Manual test:**
```bash
# Use destination returning HTTP 500
# Example: curl http://localhost:3002/status/500

curl -X POST http://localhost:3001/api/requests \
  -H "Content-Type: application/json" \
  -d '{"destinationId":"dest-500",...}'

# Verify:
# 1. HTTP attempt recorded
# 2. Job status = "retrying"
# 3. BullMQ retry counter incremented
# 4. Exponential backoff applied (2000ms * 2^attempt * jitter)
```

**Expected result:**
- ✅ HTTP call made
- ✅ Attempt recorded in DB
- ✅ Retried via BullMQ (not rate limiting)
- ✅ Exponential backoff (base 2000ms)

---

### Test 10: HTTP 400 doesn't retry if permanent
**File:** `src/__tests__/integration.rate-limit.test.ts` > "Scenario 10"

**What it validates:**
- HTTP 4xx (except 408, 429) are NOT retried
- Job marked as failed, not thrown to BullMQ retry
- Attempt recorded
- No further attempts

**Manual test:**
```bash
# Use destination returning HTTP 400
curl -X POST http://localhost:3001/api/requests \
  -H "Content-Type: application/json" \
  -d '{"destinationId":"dest-400",...}'

# Verify:
# 1. HTTP attempt recorded
# 2. Job status = "failed" (not "retrying")
# 3. No retry scheduled
# 4. Error message in last_error
```

**Expected result:**
- ✅ HTTP call made
- ✅ Attempt recorded
- ✅ Status = "failed"
- ✅ No automatic retry
- ✅ No job re-enqueue

---

### Multi-worker Coordination Test

**File:** `src/__tests__/integration.rate-limit.test.ts` > "Scenario 9"

**What it validates:**
- Two workers coordinating via Redis
- Concurrency limits respected across workers
- No slot leaks or duplicates
- Rate limits synchronized

**Manual setup:**
```bash
# Terminal 1: Start worker 1
npm run start

# Terminal 2: Start worker 2
npm run start

# Terminal 3: Submit requests
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/requests \
    -H "Content-Type: application/json" \
    -d "{\"destinationId\":\"test-dest\",\"concurrencyLimit\":2,...}" &
done

# Monitor logs from both workers
# Verify:
# 1. Max 2 jobs processing simultaneously across both workers
# 2. No slot conflicts
# 3. Consistent rate limiting (not doubled)
```

**Expected result:**
- ✅ Concurrency limit = 2 across all workers
- ✅ Never see 3+ simultaneous HTTP calls
- ✅ Rate limit applies globally (not per-worker)

---

## Integration Test Checklist

- [ ] Test 1: Rate-limited jobs rescheduled
- [ ] Test 2: No HTTP during rate limit
- [ ] Test 3: Slot released before delay
- [ ] Test 4: Jobs not duplicated
- [ ] Test 5: Delays not counted as attempts
- [ ] Test 6: Redis offline → delay + no HTTP
- [ ] Test 7: Jitter spreads retries
- [ ] Test 8: HTTP 429 + Retry-After respected
- [ ] Test 9: HTTP 500 retried with backoff
- [ ] Test 10: HTTP 400 not retried
- [ ] Multi-worker: Concurrency coordinated

## Running Full Suite

```bash
cd apps/worker

# Type check
npm run type-check

# Build
npm run build

# Integration tests with Redis running
npm run test:run

# With coverage
npm run test:coverage
```

## Debugging

### View Redis state during test
```bash
redis-cli
> KEYS *
> GET "concurrency:in_progress:dest-1"
> GET "rate_limit_window:dest-1:1000"
> HGETALL "bull:requests:jobs"
```

### View BullMQ queue state
```bash
redis-cli
> SMEMBERS "bull:requests:jobs"
> ZRANGE "bull:requests:delayed" 0 -1 WITHSCORES
> ZRANGE "bull:requests:active" 0 -1 WITHSCORES
```

### View logs
```bash
# Worker logs with timestamps
tail -f logs/worker.log | grep -E "(rate|delay|429|retry)"

# Supabase tables
SELECT * FROM requests ORDER BY created_at DESC LIMIT 10;
SELECT * FROM request_attempts ORDER BY started_at DESC LIMIT 10;
```

---

## Success Criteria

**All 10 scenarios must pass:**
- ✅ Type checks: 0 errors
- ✅ Build: successful
- ✅ Integration tests: all passing
- ✅ Multi-worker: coordinated correctly
- ✅ Logs: clear reason for each delay
- ✅ DB: no spurious HTTP attempts
- ✅ Redis: consistent slot state
- ✅ BullMQ: jobs properly rescheduled

