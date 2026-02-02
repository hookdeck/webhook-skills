# SendGrid Signature Verification

## How It Works

SendGrid uses ECDSA (Elliptic Curve Digital Signature Algorithm) with SHA-256 for webhook security:

1. SendGrid signs the payload using their private key
2. Your app verifies using the public key from your dashboard
3. Signature covers both timestamp and payload to prevent replay attacks

## Headers

SendGrid includes these headers with each webhook request:

- `X-Twilio-Email-Event-Webhook-Signature` - Base64 encoded ECDSA signature
- `X-Twilio-Email-Event-Webhook-Timestamp` - Unix timestamp as string

## Manual Verification Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifySignature(publicKey, payload, signature, timestamp) {
  // Decode the base64 signature
  const decodedSignature = Buffer.from(signature, 'base64');

  // Create the signed content: timestamp + payload
  const signedContent = timestamp + payload;

  // Create verifier with SHA256
  const verifier = crypto.createVerify('sha256');
  verifier.update(signedContent);

  // Verify the signature using the public key
  try {
    return verifier.verify(publicKey, decodedSignature);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}
```

### Python

```python
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

def verify_signature(public_key_str, payload, signature, timestamp):
    # Decode the base64 signature
    decoded_signature = base64.b64decode(signature)

    # Create the signed content
    signed_content = (timestamp + payload).encode('utf-8')

    # Parse the public key
    public_key = serialization.load_pem_public_key(
        f"-----BEGIN PUBLIC KEY-----\n{public_key_str}\n-----END PUBLIC KEY-----".encode()
    )

    try:
        # Verify the signature
        public_key.verify(
            decoded_signature,
            signed_content,
            ec.ECDSA(hashes.SHA256())
        )
        return True
    except Exception:
        return False
```

## SDK Verification

### Node.js (@sendgrid/eventwebhook)

```javascript
const { EventWebhook } = require('@sendgrid/eventwebhook');

const verifyWebhook = new EventWebhook();
const publicKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;

function verify(payload, signature, timestamp) {
  return verifyWebhook.verifySignature(
    publicKey,
    payload,
    signature,
    timestamp
  );
}
```

### Python (sendgrid)

```python
from sendgrid.helpers.eventwebhook import EventWebhook

webhook = EventWebhook()
public_key = os.environ.get('SENDGRID_WEBHOOK_VERIFICATION_KEY')

def verify(payload, signature, timestamp):
    return webhook.verify_signature(
        payload,
        signature,
        timestamp,
        public_key
    )
```

## Common Gotchas

### 1. Raw Body Requirement

**CRITICAL**: You must use the raw request body bytes, not parsed JSON.

```javascript
// ❌ WRONG - Body already parsed
app.post('/webhook', express.json(), (req, res) => {
  const payload = JSON.stringify(req.body); // Re-stringified != original
});

// ✅ CORRECT - Raw body preserved
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const payload = req.body.toString(); // Original bytes
});
```

### 2. Header Names

Headers may be lowercase in some frameworks:

```javascript
// Try both cases
const signature = req.get('X-Twilio-Email-Event-Webhook-Signature') ||
                  req.get('x-twilio-email-event-webhook-signature');
```

### 3. Public Key Format

The public key from SendGrid dashboard is base64 encoded. Some libraries expect PEM format:

```javascript
// If library needs PEM format
const pemKey = `-----BEGIN PUBLIC KEY-----
${publicKey}
-----END PUBLIC KEY-----`;
```

### 4. Timestamp String

The timestamp is sent as a string, not a number:

```javascript
// ✅ CORRECT - Use timestamp as string
const signedContent = timestamp + payload;

// ❌ WRONG - Don't convert to number
const signedContent = parseInt(timestamp) + payload;
```

## Debugging Verification Failures

1. **Log the exact headers received**:
   ```javascript
   console.log('Signature:', req.get('X-Twilio-Email-Event-Webhook-Signature'));
   console.log('Timestamp:', req.get('X-Twilio-Email-Event-Webhook-Timestamp'));
   ```

2. **Verify raw body handling**:
   ```javascript
   console.log('Payload type:', typeof req.body);
   console.log('First 100 chars:', req.body.toString().substring(0, 100));
   ```

3. **Check public key format**:
   ```javascript
   console.log('Public key starts with:', publicKey.substring(0, 20));
   console.log('Public key length:', publicKey.length);
   ```

4. **Test with SendGrid's test webhook**:
   - Use the "Test Your Integration" button in SendGrid dashboard
   - This sends a known-good signature for verification

## Security Best Practices

1. **Reject missing headers immediately**
2. **Implement timestamp validation** (optional):
   ```javascript
   const currentTime = Math.floor(Date.now() / 1000);
   const webhookTime = parseInt(timestamp);
   if (Math.abs(currentTime - webhookTime) > 300) { // 5 minutes
     return res.status(400).send('Timestamp too old');
   }
   ```
3. **Use constant-time comparison** (handled by crypto libraries)
4. **Log verification failures** for monitoring
5. **Never log the full payload** in production (may contain PII)