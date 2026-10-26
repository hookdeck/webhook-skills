# How to Verify api.video Webhook Signatures

## How It Works

- Header: `X-Api-Video-Signature: <hex>` (no prefix, the whole value is one digest)
- Algorithm: HMAC-SHA256, lowercase hex
- Key: the webhook's `signatureSecret` (`sig_sec_...`), used as UTF-8 bytes as-is (not hex- or base64-decoded)
- Signed content: the raw request body bytes only. No timestamp, id or other header is signed, so there is no replay window to enforce.
- Not Standard Webhooks (no `webhook-id` / `webhook-timestamp` / `webhook-signature`).

api.video's own PHP sample computes `hash_hmac("sha256", file_get_contents("php://input"), $secret)` and compares it to the header.

## Implementation

No SDK helper is documented, so verify manually. Validate the header format (exactly 64 hex characters), compute the HMAC over the raw bytes, then compare in constant time. Hex is case-insensitive, so lowercase the header first.

```javascript
const crypto = require('crypto');

function verifyApiVideoSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase(), 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}
```

```python
import hashlib, hmac, re

def verify_api_video_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not re.fullmatch(r"[0-9a-fA-F]{64}", signature_header):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.lower().encode(), expected.encode())
```

## Published Test Vector

api.video's docs give a worked example (secret `sig_sec_0000000000000000000000`). Every example's test suite asserts it:

- Body (byte-exact): `{"type":"video.encoding.quality.completed","emittedAt":"2021-01-29T15:46:25.217Z","videoId":"vi0000000000000000000000","liveStreamId":"li0000000000000000000000","encoding":"hls","quality":"720p"}`
- `X-Api-Video-Signature`: `27a77d3a7fc626854886b5dbfae4e32c8b0170c1ea1b714c91ba77f1e7774e8c`

The "Trigger an event" example in the docs (header starting `3b7f8f40...`) is illustrative and does not pair with its body, so do not use it as a vector.

## Common Gotchas

- **Raw body:** verify the bytes as received. Parsing and re-serialising JSON changes whitespace and breaks the digest. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Don't decode hex with `Buffer.from(sig, 'hex')`:** it silently drops bad characters. Check length and alphabet first, then compare equal-length buffers.
- **Compare bytes in Python**, not `str` with `==`.
- **Secret is per webhook:** a different subscription has a different `sig_sec_...`.
- **Don't invent a timestamp window:** `emittedAt` is in the body but is not signed separately from it, and retries re-send the same signed body.

## Debugging Verification Failures

- `401` on every request: check `API_VIDEO_WEBHOOK_SECRET` is the `signatureSecret` of the webhook that is firing (compare `X-Api-Video-WebhookID` with `GET /webhooks/{webhookId}`).
- Works in tests but fails live: a body parser or proxy ran before verification and altered the bytes.
- Header missing: confirm the request actually comes from api.video (header name is case-insensitive).
