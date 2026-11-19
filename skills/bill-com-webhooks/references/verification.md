# BILL Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `x-bill-sha-signature` |
| Algorithm | HMAC-SHA256, base64 (44 characters), no prefix |
| Key | The subscription's `securityKey`, as UTF-8 text |
| Signed content | The request body as sent (compact JSON) |
| Timestamp | None |

BILL's guide: "When you create a new subscription, a one-time `securityKey` is one of the generated values in the response. BILL uses the HMAC-SHA256 algorithm to sign all event notifications sent to your `notificationUrl` with the `securityKey`. The output format of the generated hash value is `base64`. The generated hash is sent as the `x-bill-sha-signature` header value with all event notifications."

## The Minify Step

The guide checks a signature by pasting "the unformatted (minified) version of the `payload` JSON value" and the `securityKey` into an online HMAC tool, with SHA-256 and Base64 output. The body there comes from webhook.site's **Request Content** pane, which formats JSON for display, so the guide has to undo that formatting.

BILL itself stores and sends the payload as a compact JSON string. The raw body you receive is already the minified form, so:

- **HMAC the raw bytes.** That's what the examples do.
- **Don't re-serialise.** `JSON.stringify(JSON.parse(body))` usually matches compact JSON, but can differ in number formatting, escaping or key order. Don't rely on it.
- **If verification fails,** check whether a proxy or framework middleware reformatted the body before your handler saw it.

BILL publishes no verification code and doesn't say "raw body" in so many words. Independent open-source receivers HMAC the raw body, but none shows a trace from a live delivery.

## Node.js

```javascript
const crypto = require('crypto');

function verifyBillSignature(rawBody, signature, securityKey) {
  const value = String(signature || '').trim();
  if (!securityKey || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', securityKey).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'base64'), expected);
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_bill_signature(raw_body: bytes, signature: str, security_key: str) -> bool:
    value = (signature or "").strip()
    if not security_key or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", value):
        return False
    expected = hmac.new(security_key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64decode(value), expected)
```

## Testing

`POST /v3/subscriptions/{subscriptionId}/test` sends a real signed notification to your URL, so you can check verification end to end in the sandbox.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The body was parsed and re-serialised, or pretty-printed. HMAC the raw bytes |
| Every request fails, raw body | The key is from another subscription, or was rotated. Use the latest `securityKey` for this subscription |
| Fails after a key rotation | `POST .../security-key` replaced the key. Update the configured value |
| Notifications stopped | Retries ran out and BILL set `status.enabled` to `false`. Re-enable the subscription |
| Retries even though you processed the event | You returned something other than `200` (for example `202` or `204`), or took over 10 seconds |
