# Replicate Signature Verification

## How It Works

Replicate uses a custom signature scheme to ensure webhook requests are authentic:

1. **Headers sent with each request:**
   - `webhook-id`: Unique identifier for this webhook event
   - `webhook-timestamp`: Unix timestamp when the webhook was sent
   - `webhook-signature`: HMAC-SHA256 signature(s) in base64 format

2. **Signing process:**
   - Concatenate: `${webhook_id}.${webhook_timestamp}.${raw_body}`
   - HMAC-SHA256 hash using the secret key
   - Base64 encode the result

3. **Secret format:**
   - Starts with `whsec_` prefix
   - Followed by base64-encoded key
   - Example: `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`

## Implementation

### Manual Verification (Recommended)

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(body, headers, secret) {
  const webhookId = headers['webhook-id'];
  const webhookTimestamp = headers['webhook-timestamp'];
  const webhookSignature = headers['webhook-signature'];

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error('Missing required webhook headers');
  }

  // Extract the key from the secret (remove 'whsec_' prefix)
  const key = Buffer.from(secret.split('_')[1], 'base64');

  // Create the signed content
  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', key)
    .update(signedContent)
    .digest('base64');

  // Parse signatures (can be multiple, space-separated)
  const signatures = webhookSignature.split(' ').map(sig => {
    const parts = sig.split(',');
    return parts.length > 1 ? parts[1] : sig;
  });

  // Verify at least one signature matches
  const isValid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false; // Different lengths
    }
  });

  // Verify timestamp is recent (prevent replay attacks)
  const timestamp = parseInt(webhookTimestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - timestamp > 300) { // 5 minutes
    throw new Error('Timestamp too old');
  }

  return isValid;
}
```

### Using with Express

```javascript
app.post('/webhooks/replicate',
  express.raw({ type: 'application/json' }), // CRITICAL: Raw body required
  (req, res) => {
    try {
      const isValid = verifyWebhookSignature(
        req.body,
        req.headers,
        process.env.REPLICATE_WEBHOOK_SECRET
      );

      if (!isValid) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      const event = JSON.parse(req.body.toString());
      // Process event...

      res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(400).json({ error: err.message });
    }
  }
);
```

## Common Gotchas

### 1. Raw Body Parsing
**Problem**: Using `express.json()` middleware parses the body before verification.

**Solution**: Use `express.raw()` for webhook endpoints:
```javascript
app.post('/webhooks/replicate',
  express.raw({ type: 'application/json' }),
  handler
);
```

### 2. Secret Format
**Problem**: Using the secret incorrectly (forgetting to remove prefix or decode base64).

**Solution**: Extract the key properly:
```javascript
// Correct: Remove 'whsec_' and decode base64
const key = Buffer.from(secret.split('_')[1], 'base64');

// Wrong: Using the full secret as-is
const key = secret; // Don't do this!
```

### 3. Multiple Signatures
**Problem**: Only checking the first signature when multiple are present.

**Solution**: Parse and check all signatures:
```javascript
const signatures = webhookSignature.split(' ').map(sig => {
  const parts = sig.split(',');
  return parts.length > 1 ? parts[1] : sig;
});
```

### 4. Header Name Casing
**Problem**: Headers might be lowercase in some frameworks.

**Solution**: Access headers consistently:
```javascript
// Express normalizes to lowercase
const webhookId = req.headers['webhook-id'];

// For other frameworks, you might need:
const webhookId = req.headers['Webhook-Id'] || req.headers['webhook-id'];
```

## Debugging Verification Failures

1. **Log the raw values:**
   ```javascript
   console.log('Headers:', {
     id: headers['webhook-id'],
     timestamp: headers['webhook-timestamp'],
     signature: headers['webhook-signature']
   });
   console.log('Body length:', body.length);
   console.log('Secret prefix:', secret.substring(0, 10));
   ```

2. **Common error messages and fixes:**
   - "Missing required webhook headers" → Check header names and casing
   - "Invalid signature" → Verify raw body parsing and secret format
   - "Timestamp too old" → Check server time sync or increase tolerance
   - "Different lengths" → Signature encoding mismatch

3. **Test with a known good request:**
   - Use Replicate's test webhooks to verify your implementation
   - Compare your calculated signature with the one sent

## Security Best Practices

1. **Always verify signatures** - Never trust webhook data without verification
2. **Use timing-safe comparison** - Prevents timing attacks
3. **Check timestamp freshness** - Prevents replay attacks
4. **Store secrets securely** - Use environment variables, not code
5. **Return generic errors** - Don't leak information about why verification failed