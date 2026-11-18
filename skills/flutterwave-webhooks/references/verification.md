# Flutterwave Webhook Verification

## Two Schemes

| | v4 `flutterwave-signature` | v3 `verif-hash` |
|--|----------------------------|-----------------|
| What it is | Base64 HMAC-SHA256 of the raw body | Your secret hash, sent as-is |
| Key | Secret hash as UTF-8 bytes (not decoded) | n/a |
| Proves | Sender knows the secret, and the body is unchanged | Sender knows the secret |
| Body integrity | Yes | No |
| Timestamp / replay window | None | None |

The examples check v4 when `flutterwave-signature` is present, and otherwise compare `verif-hash`. A request with a bad v4 signature is rejected even if it also carries a correct `verif-hash`: falling back would let anyone who has seen one v3 request skip the signature.

Once your account is on v4 only, you can delete the v3 branch so that the secret never has to travel in a header.

## The v4 Docs Contradict Themselves

The [v4 webhooks page](https://developer.flutterwave.com/v4/docs/webhooks) (last updated 19 October 2026) says Flutterwave "uses the secret hash you specify on your dashboard to hash the webhook response using `HMAC-SHA256`" and returns it "as `flutterwave-signature` in the header", with this helper:

```javascript
function isValidFlutterwaveWebhook(rawBody, signature, secretHash) {
  const hash = crypto.createHmac('sha256', secretHash).update(rawBody).digest('base64');
  return hash === signature;
}
```

Further down, under **Examples**, the Node.js, PHP and Python snippets compare the header directly to the secret hash (`signature !== secretHash`), as v3 does with `verif-hash`. Both can't be right.

These examples follow the HMAC helper, which matches the prose; so do Hookdeck's Flutterwave source type and the header's name. If your live v4 deliveries fail and the header equals your secret hash, your account behaves like the later examples: switch that branch to a constant-time comparison with the secret.

Note also that `https://developer.flutterwave.com/v4/docs/webhooks.md` currently serves the **v3** page. Read the rendered v4 page, or the v4 section in [llms-full.txt](https://developer.flutterwave.com/llms-full.txt).

## Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Returns 'v4', 'v3' or null (not verified). */
function verifyFlutterwaveWebhook(rawBody, headers, secretHash) {
  if (!secretHash) return null;
  const signature = headers['flutterwave-signature'];
  if (signature) {
    const expected = crypto.createHmac('sha256', secretHash).update(rawBody).digest();
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? 'v4' : null;
  }
  const verifHash = headers['verif-hash'];
  return verifHash && safeEqual(verifHash, secretHash) ? 'v3' : null;
}
```

`rawBody` must be the exact bytes: `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` in Next.js, or Flutterwave's own `bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf } })`.

## Python

```python
import base64, binascii, hashlib, hmac
from typing import Mapping, Optional

def verify_flutterwave_webhook(raw_body: bytes, headers: Mapping[str, str], secret_hash: Optional[str]) -> Optional[str]:
    if not secret_hash:
        return None
    signature = headers.get("flutterwave-signature")
    if signature:
        expected = hmac.new(secret_hash.encode("utf-8"), raw_body, hashlib.sha256).digest()
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            return None
        return "v4" if hmac.compare_digest(given, expected) else None
    verif_hash = headers.get("verif-hash")
    if verif_hash and hmac.compare_digest(verif_hash.encode("utf-8"), secret_hash.encode("utf-8")):
        return "v3"
    return None
```

## Test Vector

Flutterwave publishes no signed sample. This one is computed with the helper above (test values, not a Flutterwave secret), and the examples' tests check it:

```
secret hash = flw-test-secret-hash-7c1e
raw body    = {"webhook_id":"wbk_test0001","timestamp":1739877172874,"type":"charge.completed","data":{"id":"chg_test0001","status":"succeeded"}}
signature   = XyZb/PVeYo0px7D4KQpa/nS7KkPGH1fK7X84YdQO2Ms=
```

If your verifier passes this vector but live requests fail, the secret hash or the raw body is wrong.

## Gotchas

| Symptom | Cause |
|---------|-------|
| v4 signature never matches | The body was parsed and re-serialised. Verify the raw bytes. |
| v4 signature never matches | The digest was hex-encoded. It's base64. |
| v4 signature never matches | The secret hash was base64-decoded first. Use it as plain UTF-8 text. |
| v3 header missing | No secret hash is set in the dashboard (it's optional on v3). |
| Requests "fail" although you handled them | You returned `201`, `204` or a redirect. Return exactly `200`. |
| Comparison throws in Node | `crypto.timingSafeEqual` needs equal-length buffers; check lengths or hash both sides. |

## Debugging

1. Check which header arrived (`flutterwave-signature` or `verif-hash`). Log header **names**, never the `verif-hash` value: it is your secret.
2. Sign the logged raw body yourself with the secret hash and compare with the header.
3. Compare the raw body length with `Content-Length`.
4. Resend the webhook (v4 `POST /resend-webhook`, v3 `POST /v3/transactions/{id}/resend-hook`) after fixing.
