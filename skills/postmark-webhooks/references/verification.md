# Postmark Webhook Authentication

## No Signature Verification

Unlike many webhook providers, Postmark does NOT use cryptographic signature verification (no HMAC, no public key cryptography). Instead, Postmark relies on:

1. **HTTPS** - Encrypted transport
2. **Authentication credentials in the URL** - Basic auth or token
3. **IP allowlisting** - Optional firewall rules

## Authentication Methods

### Method 1: Basic Authentication (Recommended)

Include username and password directly in the webhook URL:

```
https://username:password@yourdomain.com/webhooks/postmark
```

**Implementation:**

```javascript
// Express - Basic auth is handled automatically by most web servers
// For manual verification:
app.use('/webhooks/postmark', (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  const credentials = Buffer.from(auth.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');

  if (username !== process.env.WEBHOOK_USERNAME ||
      password !== process.env.WEBHOOK_PASSWORD) {
    return res.status(401).send('Unauthorized');
  }

  next();
});
```

### Method 2: Token in Query Parameter

Include a secret token as a URL parameter:

```
https://yourdomain.com/webhooks/postmark?token=your-secret-token
```

**Implementation:**

```javascript
// Express
app.post('/webhooks/postmark', express.json(), (req, res) => {
  const token = req.query.token;

  if (token !== process.env.POSTMARK_WEBHOOK_TOKEN) {
    return res.status(401).send('Unauthorized');
  }

  // Process webhook
  const event = req.body;
  console.log(`Received ${event.RecordType} event`);
  res.sendStatus(200);
});
```

### Method 3: Custom Header Token

While not officially documented, you can implement your own header-based authentication:

```javascript
// Configure webhook URL with token:
// https://yourdomain.com/webhooks/postmark?token=your-secret-token
// Then validate it as a custom header

app.post('/webhooks/postmark', express.json(), (req, res) => {
  // Could also check a custom header if you proxy the request
  const token = req.headers['x-webhook-token'] || req.query.token;

  if (token !== process.env.POSTMARK_WEBHOOK_TOKEN) {
    return res.status(401).send('Unauthorized');
  }

  // Process webhook
  res.sendStatus(200);
});
```

## Security Best Practices

### 1. Use Strong Credentials

```bash
# Generate a secure token
openssl rand -base64 32
# Example output: EyR5P8XuTia44nBDZ7Te7BQXH4oX7BqNDhS6FWsz8CA=

# Generate secure password
openssl rand -base64 24
# Example output: 5KY85cWZRjaL8kUj5Qr3WtPg
```

### 2. Validate Payload Structure

Since there's no signature to verify, validate the expected payload structure:

```javascript
function isValidPostmarkPayload(payload) {
  // Check required fields
  if (!payload.RecordType || !payload.MessageID) {
    return false;
  }

  // Validate RecordType is expected
  const validTypes = ['Bounce', 'SpamComplaint', 'Open',
                     'Click', 'Delivery', 'SubscriptionChange'];
  if (!validTypes.includes(payload.RecordType)) {
    return false;
  }

  // Validate timestamp format
  if (payload.BouncedAt && !isValidISO8601(payload.BouncedAt)) {
    return false;
  }

  return true;
}

app.post('/webhooks/postmark', express.json(), (req, res) => {
  // ... authentication check ...

  if (!isValidPostmarkPayload(req.body)) {
    return res.status(400).send('Invalid payload structure');
  }

  // Process webhook
  res.sendStatus(200);
});
```

### 3. IP Allowlisting

Configure your firewall to only accept webhook requests from Postmark's IP addresses:

```nginx
# Nginx example
location /webhooks/postmark {
    # Postmark publishes their IP ranges
    # Check their documentation for current IPs
    allow 50.31.156.0/24;
    allow 50.31.156.104/32;
    # ... add all Postmark IPs
    deny all;

    proxy_pass http://your-app;
}
```

### 4. Rate Limiting

Implement rate limiting to prevent abuse:

```javascript
const rateLimit = require('express-rate-limit');

const postmarkLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per minute
  message: 'Too many webhook requests'
});

app.post('/webhooks/postmark', postmarkLimiter, express.json(), (req, res) => {
  // Process webhook
});
```

## Common Security Issues

### URL Encoding

Ensure special characters in credentials are properly URL-encoded:

```javascript
// Wrong - will break with special characters
https://user:pass@word@domain.com/webhook

// Correct - URL encode the password
https://user:pass%40word@domain.com/webhook

// JavaScript URL encoding
const username = encodeURIComponent('webhook-user');
const password = encodeURIComponent('p@ss#word!');
const url = `https://${username}:${password}@domain.com/webhooks/postmark`;
```

### Credential Exposure

Never log or expose webhook URLs with embedded credentials:

```javascript
// BAD - logs credentials
console.log(`Webhook configured at: ${webhookUrl}`);

// GOOD - sanitize URL for logging
const sanitizedUrl = webhookUrl.replace(/\/\/[^@]+@/, '//***:***@');
console.log(`Webhook configured at: ${sanitizedUrl}`);
```

### Test vs Production

Use different credentials for different environments:

```bash
# .env.development
POSTMARK_WEBHOOK_TOKEN=test-token-not-secret

# .env.production
POSTMARK_WEBHOOK_TOKEN=EyR5P8XuTia44nBDZ7Te7BQXH4oX7BqNDhS6FWsz8CA=
```

## Debugging Authentication Issues

1. **Check webhook logs in Postmark dashboard**
   - Shows HTTP status codes returned
   - Displays any error messages

2. **Use request logging**
   ```javascript
   app.use((req, res, next) => {
     console.log(`${req.method} ${req.path}`, {
       headers: req.headers,
       query: req.query,
       // Don't log body in production - may contain sensitive data
     });
     next();
   });
   ```

3. **Test with curl**
   ```bash
   # Test basic auth
   curl -X POST https://username:password@localhost:3000/webhooks/postmark \
     -H "Content-Type: application/json" \
     -d '{"RecordType":"Bounce","MessageID":"test"}'

   # Test token auth
   curl -X POST "https://localhost:3000/webhooks/postmark?token=test-token" \
     -H "Content-Type: application/json" \
     -d '{"RecordType":"Bounce","MessageID":"test"}'
   ```

## Using Hookdeck for Enhanced Security

For additional security layers, consider using Hookdeck as a webhook gateway:

- Automatic HTTPS endpoint provisioning
- Built-in authentication and verification
- Request filtering and transformation
- Retry logic and error handling
- Webhook replay capabilities

See the [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) skill for implementation details.