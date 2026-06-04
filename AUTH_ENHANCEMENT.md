# Authentication Enhancement Guide

## Overview

Enhanced authentication system for X/Twitter with automatic session management, retry mechanisms, and better error handling.

## Features

### 1. **Session Health Monitoring**
- Automatic health checks for all accounts
- Session expiration warnings
- Error count tracking
- Auto-refresh mechanism

### 2. **Retry with Exponential Backoff**
- Automatic retry on transient failures
- Exponential backoff to prevent rate limiting
- Jitter to prevent thundering herd

### 3. **User Agent Rotation**
- Multiple user agents to prevent detection
- Automatic rotation per account
- Browser-specific headers

### 4. **Query ID Management**
- Dynamic query ID tracking
- Failure detection and reporting
- Alternative query ID support

### 5. **Enhanced Proxy Management**
- Proxy health tracking
- Performance-based selection
- Automatic recovery

## API Endpoints

### Session Monitoring

#### Get All Sessions Needing Attention
```http
GET /api/auth-monitor/sessions
```

**Response:**
```json
{
  "total": 2,
  "sessions": [
    {
      "accountId": 1,
      "isValid": false,
      "needsRefresh": true,
      "errorCount": 3,
      "lastChecked": "2024-01-01T00:00:00.000Z",
      "expiresIn": 86400000
    }
  ]
}
```

#### Get Specific Session Health
```http
GET /api/auth-monitor/sessions/:accountId
```

**Response:**
```json
{
  "accountId": 1,
  "isValid": true,
  "needsRefresh": false,
  "errorCount": 0,
  "lastChecked": "2024-01-01T00:00:00.000Z",
  "expiresIn": 604800000
}
```

#### Run Batch Health Check
```http
POST /api/auth-monitor/sessions/check
```

**Response:**
```json
{
  "message": "Batch health check completed",
  "checked": 10,
  "failed": 2,
  "needsRefresh": 1
}
```

#### Clear Session Cache
```http
DELETE /api/auth-monitor/sessions/cache?accountId=1
```

### Query ID Monitoring

#### Get Query ID Status
```http
GET /api/auth-monitor/query-ids
```

**Response:**
```json
{
  "queryIds": {
    "UserByScreenName": {
      "id": "G3KGOASz96M-Qu0nwmGXNg",
      "failCount": 0,
      "lastUpdated": "2024-01-01T00:00:00.000Z",
      "hasAlternatives": false
    }
  },
  "needsUpdate": []
}
```

#### Reset Query ID Fail Counts
```http
POST /api/auth-monitor/query-ids/reset
```

### Proxy Monitoring

#### Get Proxy Statistics
```http
GET /api/auth-monitor/proxies
```

**Response:**
```json
{
  "total": 5,
  "healthy": 4,
  "unhealthy": 1,
  "proxies": [
    {
      "url": "http://proxy1.example.com:8080...",
      "isHealthy": true,
      "successRate": 95,
      "avgResponseTime": 250,
      "lastUsed": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Reset Proxy Statistics
```http
POST /api/auth-monitor/proxies/reset
```

### Overall Health

#### Get Authentication System Health
```http
GET /api/auth-monitor/health
```

**Response:**
```json
{
  "status": "ok",
  "sessions": {
    "needingAttention": 0,
    "status": "ok"
  },
  "queryIds": {
    "needingUpdate": 0,
    "status": "ok"
  },
  "proxies": {
    "total": 5,
    "healthy": 5,
    "unhealthy": 0,
    "status": "ok"
  }
}
```

## Usage Examples

### Programmatic Usage

#### Check Session Health
```typescript
import { getSessionHealth, needsSessionRefresh } from "./lib/auth-enhancer";

// Check if session needs refresh
if (needsSessionRefresh(accountId)) {
  const health = getSessionHealth(accountId);
  console.log("Session health:", health);
}
```

#### Use Retry with Backoff
```typescript
import { retryWithBackoff } from "./lib/auth-enhancer";

const result = await retryWithBackoff(
  async () => {
    // Your API call here
    return await fetchData();
  },
  {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  "fetch-data"
);
```

#### Get User Agent
```typescript
import { getUserAgentForAccount, getBrowserHeaders } from "./lib/user-agent-rotation";

const userAgent = getUserAgentForAccount(accountId);
const headers = getBrowserHeaders(userAgent);
```

#### Manage Proxies
```typescript
import { addProxy, getNextProxy, reportProxySuccess, reportProxyFailure } from "./lib/proxy-manager";

// Add proxies
addProxy("http://proxy1.example.com:8080");
addProxy("http://proxy2.example.com:8080");

// Get next proxy
const proxyUrl = getNextProxy();

// Report success/failure
reportProxySuccess(proxyUrl, 250); // 250ms response time
reportProxyFailure(proxyUrl, "Connection timeout");
```

## Configuration

### Session Check Interval
Default: 1 hour

```typescript
// In auth-enhancer.ts
const SESSION_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
```

### Expiration Warning Threshold
Default: 7 days

```typescript
// In auth-enhancer.ts
const EXPIRATION_WARNING_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
```

### Retry Configuration
```typescript
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};
```

## Monitoring Dashboard

### Session Health
Monitor session health in real-time:
- Green: All sessions healthy
- Yellow: Some sessions need attention
- Red: Critical sessions expired

### Query IDs
Track query ID failures:
- If fail count > 5: Warning
- If fail count > 10: Critical (needs manual update)

### Proxies
Monitor proxy performance:
- Success rate
- Average response time
- Health status

## Troubleshooting

### Session Keeps Expiring

**Possible causes:**
1. Cookies are actually expired
2. X/Twitter changed authentication mechanism
3. IP address blocked

**Solutions:**
1. Re-authenticate account
2. Use different proxy
3. Check X/Twitter status

### Query ID Failures

**Possible causes:**
1. X/Twitter updated query IDs
2. Rate limiting
3. Network issues

**Solutions:**
1. Check `/api/auth-monitor/query-ids` for fail counts
2. Update query IDs manually if needed
3. Implement retry logic

### Proxy Issues

**Possible causes:**
1. Proxy server down
2. Proxy blocked by X/Twitter
3. Slow proxy performance

**Solutions:**
1. Check `/api/auth-monitor/proxies` for stats
2. Remove unhealthy proxies
3. Add more proxies to pool

## Best Practices

1. **Regular Health Checks**
   - Run batch health check daily
   - Monitor sessions needing attention
   - Set up alerts for critical issues

2. **Proxy Management**
   - Use multiple proxies
   - Rotate proxies regularly
   - Monitor proxy performance

3. **User Agent Rotation**
   - Use different user agents per account
   - Update user agents periodically
   - Match headers to user agent

4. **Error Handling**
   - Implement retry logic
   - Log all authentication errors
   - Monitor error patterns

5. **Session Management**
   - Check session health before operations
   - Refresh sessions proactively
   - Clear cache when needed

## Automated Monitoring

### Cron Job Example
```bash
# Check session health every hour
0 * * * * curl -X POST http://localhost:3000/api/auth-monitor/sessions/check

# Check overall health every 15 minutes
*/15 * * * * curl http://localhost:3000/api/auth-monitor/health
```

### Alerting
Set up alerts for:
- Sessions needing attention > 5
- Query ID fail count > 10
- All proxies unhealthy
- Overall status: critical

## Performance Impact

- Session health checks: ~100ms per account
- Batch health check: ~1-2 seconds for 10 accounts
- Proxy selection: <1ms
- User agent rotation: <1ms
- Query ID lookup: <1ms

## Security Considerations

1. **Session Cache**
   - Stored in memory only
   - Cleared on restart
   - No sensitive data persisted

2. **Proxy URLs**
   - Masked in logs
   - Not exposed in API responses
   - Stored securely in database

3. **User Agents**
   - Realistic browser signatures
   - Regular updates
   - No bot-like patterns

## Future Enhancements

- [ ] Machine learning for proxy selection
- [ ] Automatic query ID discovery
- [ ] Session prediction (predict expiration)
- [ ] Advanced fingerprinting prevention
- [ ] Distributed session management
- [ ] Real-time monitoring dashboard
