# Clerk Signature Verification

## How It Works

Clerk uses Svix to sign webhooks with HMAC-SHA256. Each webhook request includes three headers that work together to ensure authenticity and prevent replay attacks:

1. **`svix-id`** - Unique identifier for the webhook message
2. **`svix-timestamp`** - Unix timestamp (seconds) when webhook was sent
3. **`svix-signature`** - HMAC signature(s) in format `v1,signature1 v1,signature2`

## Manual Verification Implementation

### Step 1: Extract Headers

```javascript
const svixId = req.headers['svix-id'];
const svixTimestamp = req.headers['svix-timestamp'];
const svixSignature = req.headers['svix-signature'];
```

### Step 2: Prepare Signed Content

The content to sign follows this exact format:

```javascript
const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
```

Where `rawBody` is the exact bytes received (not parsed JSON).

### Step 3: Extract Secret

Clerk webhook secrets have format `whsec_base64encodedkey`. Extract the base64 part:

```javascript
const secret = process.env.CLERK_WEBHOOK_SECRET; // whsec_xxxxx
const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
```

### Step 4: Calculate Expected Signature

```javascript
const expectedSignature = crypto
  .createHmac('sha256', secretBytes)
  .update(signedContent)
  .digest('base64');
```

### Step 5: Compare Signatures

Svix can send multiple signatures. Extract and check each:

```javascript
// Signature format: "v1,sig1 v1,sig2"
const signatures = svixSignature
  .split(' ')
  .map(sig => sig.split(',')[1]);

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
```

### Step 6: Validate Timestamp

Prevent replay attacks by checking timestamp (5-minute window):

```javascript
const timestamp = parseInt(svixTimestamp, 10);
const currentTime = Math.floor(Date.now() / 1000);
if (currentTime - timestamp > 300) {
  throw new Error('Timestamp too old');
}
```

## Complete Verification Examples

### Node.js/Express

```javascript
const crypto = require('crypto');

function verifyClerkWebhook(req) {
  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error('Missing required Svix headers');
  }

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  const signedContent = `${svixId}.${svixTimestamp}.${req.body}`;

  const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  const signatures = svixSignature.split(' ').map(sig => sig.split(',')[1]);
  const isValid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  });

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Check timestamp
  const timestamp = parseInt(svixTimestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - timestamp > 300) {
    throw new Error('Timestamp too old');
  }

  return JSON.parse(req.body);
}
```

### Python

```python
import hmac
import hashlib
import base64
from time import time

def verify_clerk_webhook(body: bytes, headers: dict) -> dict:
    svix_id = headers.get('svix-id')
    svix_timestamp = headers.get('svix-timestamp')
    svix_signature = headers.get('svix-signature')

    if not all([svix_id, svix_timestamp, svix_signature]):
        raise ValueError('Missing required Svix headers')

    secret = os.environ['CLERK_WEBHOOK_SECRET']
    signed_content = f"{svix_id}.{svix_timestamp}.{body.decode()}"

    secret_bytes = base64.b64decode(secret.split('_')[1])
    expected_signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    ).decode()

    signatures = [sig.split(',')[1] for sig in svix_signature.split(' ')]
    if expected_signature not in signatures:
        raise ValueError('Invalid signature')

    # Check timestamp
    current_time = int(time())
    if current_time - int(svix_timestamp) > 300:
        raise ValueError('Timestamp too old')

    return json.loads(body)
```

## Using Svix Libraries (Alternative)

Instead of manual verification, you can use Svix libraries:

### Node.js

```bash
npm install svix
```

```javascript
const { Webhook } = require('svix');

const webhook = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

try {
  const event = webhook.verify(req.body, {
    'svix-id': req.headers['svix-id'],
    'svix-timestamp': req.headers['svix-timestamp'],
    'svix-signature': req.headers['svix-signature']
  });
  // event is verified
} catch (err) {
  // Invalid signature
}
```

### Python

```bash
pip install svix
```

```python
from svix import Webhook

webhook = Webhook(os.environ['CLERK_WEBHOOK_SECRET'])

try:
    event = webhook.verify(body, {
        'svix-id': headers['svix-id'],
        'svix-timestamp': headers['svix-timestamp'],
        'svix-signature': headers['svix-signature']
    })
    # event is verified
except Exception:
    # Invalid signature
```

## Common Gotchas

### 1. Raw Body Required

**Problem**: Signature verification fails when using parsed JSON body.

**Solution**: Always use the raw request body for signature verification:

```javascript
// Express - use express.raw() middleware
app.post('/webhook', express.raw({ type: 'application/json' }), handler);

// Next.js - disable body parsing
export const config = { api: { bodyParser: false } };

// FastAPI - use Request.body()
body = await request.body()
```

### 2. Header Case Sensitivity

**Problem**: Some frameworks capitalize headers.

**Solution**: Access headers in lowercase:

```javascript
// Good
req.headers['svix-id']

// May fail
req.headers['Svix-Id']
```

### 3. Secret Format

**Problem**: Using the wrong part of the webhook secret.

**Solution**: The secret has format `whsec_base64key`. Always split on underscore and decode the base64 part:

```javascript
// Correct
const secretBytes = Buffer.from(secret.split('_')[1], 'base64');

// Wrong - using the whole secret
const secretBytes = Buffer.from(secret, 'utf8');
```

### 4. Multiple Signatures

**Problem**: Only checking the first signature when multiple are sent.

**Solution**: Svix may send multiple signatures. Check all of them:

```javascript
// Signature format: "v1,sig1 v1,sig2"
const signatures = svixSignature.split(' ').map(sig => sig.split(',')[1]);
// Check if ANY signature matches
```

## Debugging Verification Failures

1. **Log the raw body** - Ensure you're getting raw bytes, not parsed JSON
2. **Check headers** - Verify all three Svix headers are present
3. **Validate secret format** - Must start with `whsec_`
4. **Test signature calculation** - Use Clerk's test events to verify your implementation
5. **Check timestamp** - Ensure your server time is accurate

## Security Best Practices

- Always use constant-time comparison (timing-safe equal)
- Validate timestamps to prevent replay attacks
- Never log the webhook secret
- Return generic error messages to avoid leaking information
- Consider IP allowlisting for additional security