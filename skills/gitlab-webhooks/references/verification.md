# GitLab Webhook Token Verification

## How It Works

GitLab uses a simple but secure token-based authentication mechanism:

1. You create a secret token when configuring the webhook
2. GitLab sends this token in the `X-Gitlab-Token` header with each request
3. Your application compares the header value with your stored token
4. Use timing-safe comparison to prevent timing attacks

This is different from signature-based verification (like GitHub or Stripe) - GitLab sends the raw token, not a computed signature.

## Implementation

### JavaScript (Node.js)

```javascript
const crypto = require('crypto');

function verifyGitLabWebhook(tokenHeader, secret) {
  if (!tokenHeader || !secret) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(tokenHeader),
      Buffer.from(secret)
    );
  } catch (error) {
    // Buffers must be same length for timingSafeEqual
    // Different lengths = not equal
    return false;
  }
}

// Usage in Express
app.post('/webhook', express.json(), (req, res) => {
  const token = req.headers['x-gitlab-token'];

  if (!verifyGitLabWebhook(token, process.env.GITLAB_WEBHOOK_TOKEN)) {
    return res.status(401).send('Unauthorized');
  }

  // Process webhook...
});
```

### Python

```python
import secrets

def verify_gitlab_webhook(token_header: str, secret: str) -> bool:
    if not token_header or not secret:
        return False

    # Use timing-safe comparison to prevent timing attacks
    return secrets.compare_digest(token_header, secret)

# Usage in FastAPI
from fastapi import Header, HTTPException

async def webhook_handler(
    x_gitlab_token: str = Header(None),
    body: dict = Body(...)
):
    if not verify_gitlab_webhook(x_gitlab_token, os.getenv("GITLAB_WEBHOOK_TOKEN")):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Process webhook...
```

## Common Gotchas

### 1. Header Name Case Sensitivity

Different frameworks handle header names differently:

```javascript
// Express lowercases headers
const token = req.headers['x-gitlab-token'];  // ✓ Correct

// Some frameworks preserve case
const token = req.headers['X-Gitlab-Token'];  // May not work
```

### 2. Missing Token Header

GitLab only sends the token if you configured one:

```javascript
// Handle missing token gracefully
if (!token) {
  console.error('No X-Gitlab-Token header found');
  return res.status(401).send('Unauthorized');
}
```

### 3. Token Storage

Store tokens securely:

```bash
# .env file
GITLAB_WEBHOOK_TOKEN=your_secret_token_here

# Never commit tokens to version control
echo ".env" >> .gitignore
```

### 4. Unicode and Encoding

Ensure consistent encoding:

```javascript
// Both token and secret should use same encoding
Buffer.from(tokenHeader, 'utf-8')
Buffer.from(secret, 'utf-8')
```

## Security Best Practices

1. **Use Strong Tokens**: Generate cryptographically secure random tokens
   ```bash
   openssl rand -hex 32
   ```

2. **Timing-Safe Comparison**: Always use timing-safe functions
   - ✓ `crypto.timingSafeEqual()` (Node.js)
   - ✓ `secrets.compare_digest()` (Python)
   - ✗ `===` or `==` (vulnerable to timing attacks)

3. **HTTPS Only**: Always use HTTPS endpoints in production

4. **Fail Closed**: Reject requests if verification fails or errors occur

5. **Log Failures**: Monitor failed verification attempts

## Debugging Verification Failures

### 1. Check Headers

```javascript
// Log all headers to debug
console.log('Headers:', req.headers);
console.log('Token:', req.headers['x-gitlab-token']);
```

### 2. Verify Token Configuration

```bash
# Check your environment variable
echo $GITLAB_WEBHOOK_TOKEN

# Ensure no extra whitespace
node -e "console.log(JSON.stringify(process.env.GITLAB_WEBHOOK_TOKEN))"
```

### 3. Test with Curl

```bash
# Test your endpoint directly
curl -X POST http://localhost:3000/webhooks/gitlab \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: your_secret_token" \
  -H "X-Gitlab-Event: Push Hook" \
  -d '{"object_kind": "push"}'
```

### 4. GitLab Test Feature

Use GitLab's webhook test button and check:
- "Recent events" tab for request/response details
- Response status code (should be 2xx)
- Response time (must be under 10 seconds)

## No SDK Required

Unlike other providers, GitLab's token verification is simple enough that no SDK is needed:

```javascript
// No need for gitlab package, just use built-in crypto
const crypto = require('crypto');

// That's it! No complex signatures or parsing needed
```

This makes GitLab webhooks lightweight and easy to implement in any language.