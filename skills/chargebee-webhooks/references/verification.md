# Chargebee Webhook Verification

## How It Works

Chargebee uses HTTP Basic Authentication to verify webhooks. When Chargebee sends a webhook to your endpoint, it includes an `Authorization` header with Base64-encoded credentials.

### Basic Auth Format

```
Authorization: Basic base64(username:password)
```

For example, if your credentials are:
- Username: `webhook_user`
- Password: `secret_pass`

The header would be:
```
Authorization: Basic d2ViaG9va191c2VyOnNlY3JldF9wYXNz
```

## Implementation

### Manual Verification (Recommended)

Here's how to manually verify Basic Auth in different languages:

#### Node.js/Express

```javascript
function verifyChargebeeAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  // Decode Base64
  const encoded = auth.substring(6);
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

  // Split username:password
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    return res.status(401).send('Invalid authorization format');
  }

  const username = decoded.substring(0, colonIndex);
  const password = decoded.substring(colonIndex + 1);

  // Verify credentials
  const expectedUsername = process.env.CHARGEBEE_WEBHOOK_USERNAME;
  const expectedPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).send('Invalid credentials');
  }

  next();
}

app.post('/webhooks/chargebee', express.json(), verifyChargebeeAuth, (req, res) => {
  // Handle webhook
});
```

#### Python/FastAPI

```python
import base64
from fastapi import Header, HTTPException

def verify_chargebee_auth(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Decode Base64
    encoded = authorization[6:]
    try:
        decoded = base64.b64decode(encoded).decode('utf-8')
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authorization encoding")

    # Split username:password
    if ':' not in decoded:
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    username, password = decoded.split(':', 1)

    # Verify credentials
    expected_username = os.getenv("CHARGEBEE_WEBHOOK_USERNAME")
    expected_password = os.getenv("CHARGEBEE_WEBHOOK_PASSWORD")

    if username != expected_username or password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return True
```

## Common Gotchas

### 1. Missing Authorization Header
Some proxies or load balancers may strip the Authorization header. Ensure your infrastructure preserves headers.

### 2. Case-Sensitive Headers
Header names are case-insensitive, but some frameworks normalize them:
- Express: `req.headers.authorization` (lowercase)
- Some frameworks: `req.headers['Authorization']` (original case)

### 3. Colon in Password
Passwords can contain colons. Always split on the first colon only:
```javascript
// CORRECT - splits on first colon only
const colonIndex = decoded.indexOf(':');
const username = decoded.substring(0, colonIndex);
const password = decoded.substring(colonIndex + 1);

// WRONG - splits on all colons
const [username, password] = decoded.split(':');  // Breaks if password has ':'
```

### 4. Base64 Padding
Ensure proper Base64 decoding that handles padding correctly. Most standard libraries handle this automatically.

### 5. Empty Credentials
Handle edge cases where username or password might be empty:
```javascript
if (!username || !password) {
  return res.status(401).send('Empty credentials');
}
```

## Debugging Verification Failures

### 1. Log the Authorization Header (Development Only)

```javascript
console.log('Auth header:', req.headers.authorization);
console.log('Decoded:', Buffer.from(auth.substring(6), 'base64').toString());
```

**WARNING**: Never log credentials in production!

### 2. Common Error Messages

| Error | Possible Cause | Solution |
|-------|----------------|----------|
| "Missing authorization header" | No header sent | Check Chargebee webhook config |
| "Invalid authorization format" | Malformed header | Verify Basic Auth is enabled |
| "Invalid credentials" | Wrong username/password | Check environment variables |
| "Invalid base64" | Encoding issue | Check for header corruption |

### 3. Test with curl

Test your endpoint with curl to isolate issues:

```bash
# Calculate Base64 for your credentials
echo -n "your_username:your_password" | base64

# Test the endpoint
curl -X POST https://your-app.com/webhooks/chargebee \
  -H "Authorization: Basic eW91cl91c2VybmFtZTp5b3VyX3Bhc3N3b3Jk" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "test", "id": "test_event"}'
```

## Security Best Practices

1. **Use Environment Variables**: Never hardcode credentials
2. **Use HTTPS**: Always use HTTPS in production
3. **Timing-Safe Comparison**: While not critical for Basic Auth, consider using timing-safe string comparison
4. **Rate Limiting**: Implement rate limiting to prevent brute force attacks
5. **Fail Fast**: Return 401 immediately on auth failure
6. **Don't Reveal Details**: Use generic error messages like "Unauthorized"