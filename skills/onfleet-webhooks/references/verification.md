# How to Verify Onfleet Webhook Signatures

## How Does Onfleet Sign Webhooks?

Onfleet signs each `POST` with an HMAC and sends the result in the
`X-Onfleet-Signature` header:

| | |
|---|---|
| Header | `X-Onfleet-Signature` |
| Algorithm | HMAC-**SHA512** |
| Key | Your organisation's webhook secret, **hex-decoded** to bytes |
| Message | The **raw request body** bytes, exactly as sent |
| Encoding | Hex digest (128 characters) |

Nothing else is signed: no timestamp, no URL, no prefix. There's no
`t=`/`v1=` structure either; the header is just the hex digest.

The **`GET ?check=` validation request is not signed**. Don't run it through
signature verification. See [setup.md](setup.md).

## Implementation

There's no Onfleet SDK helper for webhook verification. Onfleet's docs give
the HMAC directly, so the examples use the platform crypto library.

### Node.js

```javascript
const crypto = require('crypto');

function verifyOnfleetSignature(rawBody, signatureHeader, secretHex) {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Onfleet-Signature header' };
  }

  const expected = crypto
    .createHmac('sha512', Buffer.from(secretHex, 'hex'))
    .update(rawBody)
    .digest('hex');

  // Onfleet's docs say to compare the hex strings. Normalise case defensively.
  const received = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const computed = Buffer.from(expected, 'utf8');

  // timingSafeEqual throws on unequal lengths, so check first.
  if (received.length !== computed.length) {
    return { valid: false, error: 'Invalid signature' };
  }
  if (!crypto.timingSafeEqual(received, computed)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}
```

Get the raw body with `express.raw({ type: '*/*' })` in Express, or
`Buffer.from(await request.arrayBuffer())` in a Next.js route handler.

### Python

```python
import hashlib
import hmac

def verify_onfleet_signature(raw_body: bytes, signature_header, secret_hex: str):
    if not signature_header:
        return {"valid": False, "error": "Missing X-Onfleet-Signature header"}

    expected = hmac.new(bytes.fromhex(secret_hex), raw_body, hashlib.sha512).hexdigest()

    # Compare as bytes: compare_digest raises TypeError on a str containing
    # non-ASCII characters, which a forged header can carry.
    received = signature_header.strip().lower().encode("utf-8")
    if not hmac.compare_digest(received, expected.encode("utf-8")):
        return {"valid": False, "error": "Invalid signature"}
    return {"valid": True}
```

Get the raw body with `await request.body()` in FastAPI. Onfleet's own Python
sample uses `binascii.a2b_hex(secret)`, which is the same as `bytes.fromhex`.

### Validate the secret first

Both languages are lenient with malformed hex:

- **Node:** `Buffer.from('abcxyz', 'hex')` stops at the first non-hex
  character and returns a shorter key, with no error.
- **Python:** `bytes.fromhex` raises on odd-length or non-hex input, and skips
  whitespace.

A mis-pasted secret then either crashes requests or quietly produces a
different key. The examples check the secret against `^[0-9a-fA-F]+$` with an
even length, and fail closed with a `500` if it doesn't match.

## Common Mistakes

Each of these produces a well-formed hex digest that never matches. The
example test suites include a regression test for each one.

| Mistake | Wrong | Right |
|---|---|---|
| Secret used as a UTF-8 string | `createHmac('sha512', secret)` / `hmac.new(secret.encode(), ...)` | `Buffer.from(secret, 'hex')` / `bytes.fromhex(secret)` |
| Wrong hash | `sha256` | `sha512` |
| Re-serialised JSON | `JSON.stringify(req.body)` / `json.dumps(await request.json())` | The raw body bytes |
| Malformed secret | `Buffer.from(badHex, 'hex')` silently truncates | Validate the hex first |
| API key instead of webhook secret | `ONFLEET_API_KEY` | The secret from **Show Secret** |
| Signature check on the `GET` | Handshake rejected, webhook won't save | Only verify `POST` |

## No Timestamp, No Replay Window

The signature covers only the body. Onfleet sends no timestamp header and the
payload isn't signed together with one, so there's no replay window to
enforce. A captured request can be replayed and will still verify.

To limit the impact:

- Make handlers **idempotent**: Onfleet also retries timed-out deliveries, so
  you'll see duplicates anyway. Dedupe on `triggerId` + the entity id
  (`taskId`, `workerId`, `routePlanId`) + `time`.
- Treat the webhook as a notification. For high-value actions, re-read the
  current state from the Onfleet API before acting.
- Keep the endpoint on HTTPS so payloads can't be captured in transit.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| Every delivery fails | Secret not hex-decoded, SHA-256 instead of SHA-512, or the API key used as the secret |
| Your own test signatures pass, real deliveries fail | JSON middleware ran before verification and the body was re-serialised |
| `500` from the examples | `ONFLEET_WEBHOOK_SECRET` unset or not valid hex |
| Webhook won't save in Onfleet | `GET ?check=` not answered with `200` plain text (see [setup.md](setup.md)) |
| Webhook stopped receiving events | 300 consecutive failures disabled it |

**Quick check:** with the secret `6f6e666c6565742d746573742d7365637265742d6b6579`
(hex of `onfleet-test-secret-key`) and this exact body:

```
{"triggerId":6,"triggerName":"taskCreated","taskId":"txiK2xHBIaUwAKB~BJrjscKu","time":1613002584051}
```

the signature is:

```
d7b1dead2bca4ecb74d35eba8541ec308d372367c9068bb207467cd35f230572875a05e2b159373f2d9d8ca1ebf812522c861758b288d4ce041d827ab47c4f69
```

If your verifier rejects it, the bug is in your verifier. Every example's test
suite runs this check.
