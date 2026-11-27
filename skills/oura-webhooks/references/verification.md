# Oura Signature Verification

Oura webhook security has **two parts**: the one-time subscription **handshake** (GET) and
the per-event **HMAC signature** (POST). Both are covered here.

## Part 1 — Subscription Handshake (GET)

When you create a subscription, Oura sends a `GET` to your callback URL:

```
GET /webhooks/oura?verification_token=<your-token>&challenge=<random>
```

Your handler must:

1. Read the `verification_token` query param and compare it to the token you configured.
2. If it matches, respond `200` with JSON `{"challenge": "<the challenge value>"}`.
3. If it doesn't, respond `401`.

```javascript
// Express
app.get('/webhooks/oura', (req, res) => {
  const { verification_token, challenge } = req.query;
  if (verification_token && verification_token === process.env.OURA_VERIFICATION_TOKEN) {
    return res.status(200).json({ challenge });
  }
  return res.status(401).send('Invalid verification token');
});
```

## Part 2 — Event Signature (POST)

Each event `POST` carries two headers:

| Header | Value |
|--------|-------|
| `x-oura-signature` | HMAC-SHA256 hex digest, **UPPERCASE** |
| `x-oura-timestamp` | Timestamp prepended to the signed content (Oura's example: `1234567890`) |

### Algorithm

- **Key:** your **client secret** (`OURA_CLIENT_SECRET`)
- **Message:** `x-oura-timestamp` value **concatenated with the raw request body**
- **Digest:** SHA-256, hex-encoded, **converted to UPPERCASE**
- **Compare:** timing-safe equality against `x-oura-signature`

```javascript
const crypto = require('crypto');

function verifyOuraSignature(rawBody, signature, timestamp, clientSecret) {
  if (!signature || !timestamp) return false;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(timestamp + rawBody)     // timestamp string + raw body
    .digest('hex')
    .toUpperCase();
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;                    // length mismatch = invalid
  }
}
```

```python
import hmac, hashlib

def verify_oura_signature(raw_body: bytes, signature: str, timestamp: str, client_secret: str) -> bool:
    if not signature or not timestamp:
        return False
    expected = hmac.new(
        client_secret.encode("utf-8"),
        timestamp.encode("utf-8") + raw_body,   # timestamp + raw body
        hashlib.sha256,
    ).hexdigest().upper()
    return hmac.compare_digest(expected, signature)
```

## Raw body vs. `JSON.stringify` (important gotcha)

Oura's official docs show the signed message as `timestamp + JSON.stringify(body)`, where
`body` is the **parsed** payload. This skill signs `timestamp + rawBody` (the exact bytes
received) instead, because:

- The raw body **is** the serialization Oura signed, so it is byte-identical.
- Re-serializing is fragile across languages and libraries. Notably, Python's
  `json.dumps(body)` inserts spaces (`{"a": 1}`) while JavaScript's `JSON.stringify`
  does not (`{"a":1}`) — a naive port silently fails signature checks.

If you *must* re-serialize the parsed body (e.g. your framework only exposes parsed JSON),
you must reproduce Oura's exact serialization: **compact JSON, no extra whitespace, original
key order**. In Python that means `json.dumps(body, separators=(",", ":"))`. Using the raw
body avoids this entirely — always capture the raw body **before** any JSON parsing.

## Common Gotchas

- **Uppercase the digest.** Oura sends an uppercase hex signature; a lowercase `digest('hex')`
  without `.toUpperCase()` will never match.
- **Use the raw body**, not the re-serialized parsed object (see above).
- **Concatenation order is `timestamp + body`** — timestamp first, no separator character.
- **Handle both GET and POST** on the same route. A `GET` with no signature header is the
  handshake, not a failed event.
- **Respond within 10 seconds** with a `2xx`. Verify fast; process heavy work asynchronously.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Signature never matches | Missing `.toUpperCase()`, or comparing against a lowercase digest |
| Works in Node, fails in Python | `json.dumps` added spaces — use the raw body |
| Intermittent failures | Body was parsed/re-serialized before hashing; capture raw body first |
| Handshake fails | Wrong `verification_token`, or not echoing `challenge` as JSON |
| Wrong key | HMAC key must be the **client secret**, not the client ID or verification token |
