# How to Verify Worldline Webhook Signatures

## How Does Worldline Sign Webhooks?

Worldline Connect and Worldline Direct use the same scheme, and both official Node SDKs implement byte-for-byte the same verifier. It is a plain symmetric HMAC in a custom header: no timestamp, no nonce, no asymmetric key, no field concatenation.

| | |
|---|---|
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body bytes, exactly as received. The docs say to "Retrieve the body of the request and convert it to bytes using UTF-8 encoding". Nothing else goes in: no timestamp, header, URL or method |
| Encoding | Standard base64 with padding (`digest("base64")`). Not hex, not base64url |
| `X-GCS-Signature` | "The HMAC-SHA256 signature of the HTTP body" |
| `X-GCS-KeyId` | "The id of the key that was used to create the signature" |
| Key | The **webhooks secret key** for that key id, used as a UTF-8 string. Not the REST API key |

## Implementation

### Manual verification (what the examples do)

The examples implement the HMAC with the standard library so the crypto is visible.

**Node.js**

```javascript
const crypto = require('crypto');

function verifyWorldlineSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b); // length check: timingSafeEqual throws
}

// Key lookup: the secret is chosen by X-GCS-KeyId, never assumed.
const store = new Map([[process.env.WORLDLINE_WEBHOOK_KEY_ID, process.env.WORLDLINE_WEBHOOK_SECRET]]);
const secret = store.get(req.get('X-GCS-KeyId'));
if (!secret) return res.status(401).end(); // unknown key id
```

**Python**

```python
import base64, hashlib, hmac

def verify_worldline_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8"))
```

Compare the base64 strings, as the SDKs do. Don't base64-decode the header first: decoders accept non-canonical input such as base64url, missing padding or stray characters, and Worldline never sends those.

### Official SDK alternative

If you already use a Worldline SDK, its verifier does the same check in one call:

| Platform / language | Package / file | Entry point |
|---|---|---|
| Connect, Node | npm `connect-sdk-nodejs`, `lib/webhooks/validation.js` | `newSignatureValidator(secretKeyStore)` → `validate(body, headers)` |
| Connect, Node | `lib/v1/webhooks/index.js` | `unmarshal(body, headers)`: validates, parses, then requires `apiVersion === "v1"` |
| Direct, Node | npm `onlinepayments-sdk-nodejs`, `lib/esm/src/webhooks/validation.js` | same shape as Connect |
| Connect, .NET | `WebhooksHelper.cs` | `ValidateBody` |
| Connect, Go | `webhooks/Helper.go` | `validate` |
| Connect, Java | `WebhooksHelper.java` | `validateBody` |
| Connect, PHP | `WebhooksHelper.php` | `validateBody` |
| Connect, Python 2/3 | `web_hooks_helper.py` | `__validate_body` |
| Connect, Ruby | `webhooks_helper.rb` | `validate_body` |

Both Node SDKs model the key lookup as a `SecretKeyStore` with `getSecretKey(keyId)`, which throws `SecretKeyNotAvailableError` for an unknown id. They compare with the `secure-compare` package. The Java sample in the docs calls it `areEqualSignatures`. The SDK `unmarshal` also **throws** when `apiVersion` isn't `"v1"`. If you use it, catch that error and acknowledge the delivery, so a future version rollout doesn't 4xx every event.

## Why Does X-GCS-KeyId Matter? (Key Rotation)

Connect can hold several webhooks keys, and it signs with the **oldest**: "The messages will be signed with the key that has been added first, so the oldest key is what we'll use. […] The safest way to incorporate this on your end is to look at the request's X-GCS-KeyId HTTP header which contains the key id of the key that we used to sign the message. You can look up the secret key in your own configuration based on that key id."

So:

- Keep a **key id → secret map** (the examples seed it from `WORLDLINE_WEBHOOK_KEY_ID`/`_SECRET` plus an optional `_PREVIOUS` pair).
- **Reject an unknown key id with 401.** Falling back to "the one secret we have" hides misconfiguration and weakens the check.
- **Direct** has no overlap window: generating a new pair "will create a new pair and revoke the existing one immediately". Deploy the new secret at once.

## What About the GET Request With No Signature? (Connect)

Connect checks endpoint ownership with an **unsigned GET**: "we send an HTTPS GET request to it as soon as it's created. This request includes a random string in the 'X-GCS-Webhooks-Endpoint-Verification' HTTP header. The endpoint's response should be a plain text body containing only this header's value."

- Serve `GET` on the same path. Return `200`, `Content-Type: text/plain`, and the header value as the whole body, with no JSON, quotes or trailing newline.
- **Don't run signature verification on the GET.** It has no `X-GCS-Signature`. This doesn't open a hole: the GET carries no payload and triggers no state change; it only proves you own the URL. POSTs are always verified.
- Direct doesn't send this GET. Answering it anyway lets one handler serve both platforms.

## Common Gotchas

- **Raw body is mandatory.** A JSON parse and re-serialise changes the bytes: whitespace, key order, number and timestamp formatting. Express: `express.raw({ type: '*/*' })` on the route, or `express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })`. Deliveries use plain `application/json`, so the default parser type matches; the problem is parsing, not the type. Next.js: `await request.text()`. FastAPI: `await request.body()`.
- **Base64, not hex.** A hex digest is 64 characters; the base64 header is 44 characters ending in `=`.
- **Webhooks secret key, not the REST API key.**
- **No timestamp, no replay window.** Don't invent an `X-GCS-Timestamp` or a tolerance check. Replay protection comes from **deduplicating on the event `id`**, which is also what the docs prescribe for duplicates.
- **Empty bodies have valid signatures.** Direct's `ValidateWebhookCredentials` uses this: it takes "the base64-encoded value of an empty string hashed over by the webhooks secret you have configured in your account". A receiver must still require a non-empty JSON body (`400` otherwise).
- **Fail closed.** If the secret isn't configured, return `401` and log. Never skip verification, and don't crash the process at import time over a missing env var.
- **Constant-time comparison.** `crypto.timingSafeEqual` (after a length check) or `hmac.compare_digest`. You don't need `secure-compare` as a dependency.
- **`retry-count` (Direct) and custom headers are not signed.** Use `retry-count` for logging only. A custom header is a second check, never a replacement for the HMAC.
- **CSRF middleware** will reject deliveries. Exempt the route.

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Every POST returns 401 | Body parsed before hashing | Hash the raw bytes |
| Some keys fail, others pass | Single secret, `X-GCS-KeyId` ignored | Look up the secret by key id; remember Connect uses the oldest key |
| "Unknown key id" | Key id not configured, or the env var holds the wrong value | Copy the key id exactly as shown with the secret |
| Fails right after regenerating keys (Direct) | Old pair revoked at once | Deploy the new secret |
| Endpoint "deactivated" (Connect) | GET handshake not echoed | Return the header value as a `text/plain` body, then click activate |
| 500 on a malformed header | `timingSafeEqual` length mismatch | Check lengths first (the examples do) |

Compute a signature by hand to compare:

```bash
printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WORLDLINE_WEBHOOK_SECRET" -binary | base64
```

Log the key id and whether the check passed. Don't log the body or the secret.
