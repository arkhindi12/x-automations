# API Documentation

## Overview

X Automation Dashboard API provides endpoints for managing Twitter/X automation tasks including account management, job scheduling, media extraction, and post publishing.

## Base URL

```
Production: https://your-domain.com/api
Development: http://localhost:3000/api
```

## Rate Limiting

All API endpoints are rate-limited to prevent abuse:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| General API | 100 requests | 15 minutes |
| Authentication | 5 attempts | 15 minutes |
| Account Operations | 10 requests | 15 minutes |
| Job Creation | 20 jobs | 1 hour |
| Media Upload | 50 uploads | 1 hour |
| Post Creation | 30 posts | 1 hour |

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets (ISO 8601)

When rate limit is exceeded, API returns `429 Too Many Requests` with:
```json
{
  "error": "Too many requests, please try again later.",
  "retryAfter": 900
}
```

## Authentication

Currently, the API does not require authentication for requests. However, X/Twitter account credentials are required for automation operations.

### Account Authentication Modes

1. **OAuth 1.0a** (Recommended for production)
   - Requires: API Key, API Secret, Access Token, Access Token Secret
   - More stable and reliable
   - Better rate limits

2. **Cookie-based** (Alternative)
   - Requires: auth_token, ct0 cookies
   - Easier to set up
   - May expire more frequently

## Error Handling

All errors follow a consistent format:

### Success Response
```json
{
  "data": { ... }
}
```

### Error Response
```json
{
  "error": "Error message",
  "details": { ... } // Optional, for validation errors
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error |

### Validation Errors

Validation errors include field-specific details:

```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "username",
      "message": "Username is required"
    }
  ]
}
```

## Endpoints

### Health Check

#### GET /api/health

Check API health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### Accounts

Manage X/Twitter accounts for automation.

#### GET /api/accounts

List all accounts.

**Response:**
```json
[
  {
    "id": 1,
    "username": "example",
    "authMode": "oauth",
    "isActive": true,
    "postsCount": 42,
    "lastHealthCheck": "2024-01-01T00:00:00.000Z",
    "healthStatus": "ok",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

#### POST /api/accounts/test

Test account credentials before creating.

**Rate Limit:** 5 requests per 15 minutes

**Request Body:**
```json
{
  "username": "example",
  "authMode": "oauth",
  "apiKey": "...",
  "apiSecret": "...",
  "accessToken": "...",
  "accessTokenSecret": "...",
  "proxyUrl": "http://proxy:port" // Optional
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Credentials are valid",
  "authMode": "oauth",
  "proxyChecked": true
}
```

#### POST /api/accounts

Create a new account.

**Rate Limit:** 10 requests per 15 minutes

**Request Body:** Same as `/test` endpoint

**Response:** Created account object

#### PUT /api/accounts/:id

Update an account.

**Rate Limit:** 10 requests per 15 minutes

#### DELETE /api/accounts/:id

Delete an account.

**Rate Limit:** 10 requests per 15 minutes

---

### Jobs

Manage automation jobs for extracting and posting media.

#### GET /api/jobs

List all jobs.

#### POST /api/jobs

Create a new job.

**Rate Limit:** 20 jobs per hour

**Request Body:**
```json
{
  "accountId": 1,
  "targetId": 1,
  "scheduleType": "interval",
  "scheduleValue": "3600",
  "isActive": true,
  "watermarkEnabled": false
}
```

#### POST /api/jobs/:id/run

Run a job immediately.

**Rate Limit:** 10 requests per 15 minutes

---

### Media

Manage extracted media files.

#### GET /api/media

List all media.

#### POST /api/media/extract

Extract media URL from a source.

**Rate Limit:** 50 requests per hour

---

### Posts

Manage scheduled posts.

#### GET /api/posts

List all posts.

#### POST /api/posts

Create a scheduled post.

**Rate Limit:** 30 posts per hour

---

## Best Practices

1. **Handle Rate Limits**
   - Check `X-RateLimit-Remaining` header
   - Implement exponential backoff when rate limited
   - Cache responses when possible

2. **Error Handling**
   - Always check HTTP status codes
   - Parse error messages for user feedback
   - Log errors for debugging

3. **Security**
   - Never expose API credentials in client-side code
   - Use HTTPS in production
   - Validate all user inputs

4. **Performance**
   - Use pagination for large datasets
   - Implement request timeouts
   - Monitor API response times

## Support

For issues or questions:
- Check logs: `pm2 logs x-auto-api`
- Review error messages in responses
- Ensure environment variables are set correctly
