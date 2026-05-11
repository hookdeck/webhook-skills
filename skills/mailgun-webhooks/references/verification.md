# Mailgun Signature Verification

## How It Works

Mailgun signs each webhook so you can confirm it actually came from Mailgun and hasn't been tampered with. Unlike most providers, **Mailgun delivers the signature inside the request body, not in a header**.

Every webhook payload contains a `signature` object with three fields:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | Seconds since Unix epoch when Mailgun signed the event |
| `token` | string | A 50-character random string, unique per webhook |
| `signature` | string | Hex-encoded HMAC-SHA256 of `timestamp + token` using your HTTP Webhook Signing Key |

To verify:

1. Read the `signature` object from the parsed JSON body.
2. Concatenate `timestamp + token` with **no separator**.
3. Compute `HMAC-SHA256(signing_key, timestamp + token)`.
4. Compare the resulting hex digest with `signature.signature` using a timing-safe comparison.

## Why No Header?

Because the signature is in the body, you can — and should — parse the JSON before verifying. This is the **opposite** of providers like Stripe or SendGrid where you must keep the raw body. With Mailgun, `req.json()` / `express.json()` is fine.

## Manual Verification (All Frameworks)

### Node.js

```javascript
const crypto = require('crypto');

function verifyMailgun(signature, signingKey) {
  const { timestamp, token, signature: providedSig } = signature || {};

  if (!timestamp || !token || !providedSig) return false;

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(providedSig, 'hex')
    );
  } catch {
    // Different-length buffers throw — treat as invalid
    return false;
  }
}
```

### Python

```python
import hmac
import hashlib

def verify_mailgun(signature: dict, signing_key: str) -> bool:
    timestamp = signature.get("timestamp", "")
    token = signature.get("token", "")
    provided = signature.get("signature", "")

    if not (timestamp and token and provided):
        return False

    expected = hmac.new(
        signing_key.encode(),
        (timestamp + token).encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, provided)
```

### TypeScript (Next.js / Web Crypto)

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

interface MailgunSignature {
  timestamp: string;
  token: string;
  signature: string;
}

export function verifyMailgun(
  signature: MailgunSignature,
  signingKey: string
): boolean {
  const { timestamp, token, signature: providedSig } = signature;

  if (!timestamp || !token || !providedSig) return false;

  const expected = createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(providedSig, 'hex')
    );
  } catch {
    return false;
  }
}
```

## SDK Verification

Mailgun's official Node SDK (`mailgun.js`) and Python SDK do not currently provide a first-class webhook verification helper, so **manual verification is the standard approach** in all frameworks.

## Subaccount `parent-signature`

When events come from a Mailgun subaccount, the payload may include an additional `parent-signature` field that mirrors `signature` but is computed with the **parent account's** signing key.

```json
{
  "signature": {
    "timestamp": "1529006854",
    "token": "...",
    "signature": "...",
    "parent-signature": "..."
  }
}
```

If your endpoint is owned by the parent account, verify the `parent-signature` value using the parent's HTTP Webhook Signing Key (use the same algorithm — HMAC-SHA256 over `timestamp + token`).

```javascript
function verifyParent(signature, parentSigningKey) {
  const parentSig = signature['parent-signature'];
  if (!parentSig) return verifyMailgun(signature, parentSigningKey);  // not a subaccount event

  const expected = crypto
    .createHmac('sha256', parentSigningKey)
    .update(signature.timestamp + signature.token)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(parentSig, 'hex')
    );
  } catch {
    return false;
  }
}
```

## Common Gotchas

### 1. The Signature Is in the Body, Not a Header

Most webhook providers put the signature in a header. Mailgun does not. Look for `req.body.signature`, **not** `req.headers['x-mailgun-signature']`.

### 2. No Separator Between `timestamp` and `token`

The signed content is the raw concatenation `timestamp + token`. There is **no** dot, dash, colon, or newline between them. A common bug is writing `${timestamp}.${token}` (Stripe style) — that will never verify.

### 3. JSON Parsing Is Fine

Because the signature only covers `timestamp + token` (not the body), you can freely parse the JSON before verifying. There's no need for `express.raw()` or `request.body()` byte handling.

### 4. Wrong Key

The HTTP Webhook Signing Key is **different** from your API key. It's listed separately in **Sending → API Keys** under "HTTP webhook signing key". If verification always fails, double-check you're using the right key.

### 5. Timing-Safe Comparison

Always use `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python) — never `===` or `==` — to compare signatures. Mismatched lengths throw in Node, so wrap in `try/catch`.

### 6. Replay Attacks

The `signature` object is identical on every retry of the same event, so a leaked payload can be replayed. Cache the `token` value (e.g., in Redis with a 24h TTL) and reject duplicates:

```javascript
const seen = await redis.set(`mg:${signature.token}`, '1', 'EX', 86400, 'NX');
if (seen === null) {
  return res.status(200).send('Duplicate');  // 200 stops Mailgun retries
}
```

### 7. Stale Timestamps

Optionally reject very old webhooks to limit the replay window. Stay lenient — Mailgun's retry queue can deliver events several hours late:

```javascript
const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(signature.timestamp, 10);
if (ageSeconds > 60 * 60 * 24) {  // 24 hours
  return res.status(400).send('Stale webhook');
}
```

## Debugging Verification Failures

If verification fails, walk through these checks:

1. **Confirm you're reading from the body**, not a header:
   ```javascript
   console.log('Signature object:', req.body.signature);
   ```
2. **Compute and log the expected hex digest** — compare side-by-side:
   ```javascript
   const expected = crypto
     .createHmac('sha256', signingKey)
     .update(req.body.signature.timestamp + req.body.signature.token)
     .digest('hex');
   console.log('Expected:', expected);
   console.log('Got:     ', req.body.signature.signature);
   ```
3. **Verify the key**: log the first/last 4 chars of the signing key (never log the full key) to confirm it matches the dashboard value.
4. **Test with Mailgun's "Test webhook" button** in the dashboard — known-good signatures help isolate the bug.

## Security Best Practices

- **Always verify before processing** — reject unsigned or invalid payloads with HTTP 400.
- **Use HTTPS endpoints** — never accept webhooks over plain HTTP.
- **Cache the `token`** for replay protection.
- **Don't log signing keys or full payloads** in production (payloads may contain recipient email addresses — PII).
- **Return 200 quickly** so Mailgun considers the delivery successful; do heavy work asynchronously.
