# How to Verify Sinch Webhook Signatures

> For Sinch Conversation API callbacks. Set a secret on the Conversation API webhook and paste it here; other Sinch APIs sign callbacks differently.

## How Does Sinch Sign Callbacks?

Conversation API callbacks carry three headers (only when the webhook has a `secret`):

```
x-sinch-webhook-signature: <base64>
x-sinch-webhook-signature-nonce: <nonce>
x-sinch-webhook-signature-timestamp: <unix seconds>
```

- **Algorithm:** HMAC-SHA256, output as standard padded base64 (44 characters, no prefix)
- **Key:** the webhook `secret`, its UTF-8 bytes used as-is (not hex- or base64-decoded)
- **Signed message:** the raw request body bytes, a literal `.`, the nonce header value, a literal `.`, the timestamp header value: `rawBody + "." + nonce + "." + timestamp`. Body **first**.
- **Not Standard Webhooks:** there are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers
- **No Python/Node helper used here**, so verification is manual in all three examples

Sinch's own sample: `var signedData = rawBody + '.' + nonce + '.' + timestamp`, then `crypto.createHmac('sha256', secret).update(signedData).digest('base64')`.

## How Do I Implement It?

Build the signed message as **bytes**:

```javascript
// Node.js
const signed = Buffer.concat([rawBody, Buffer.from('.'), Buffer.from(nonce, 'latin1'), Buffer.from('.'), Buffer.from(timestamp, 'latin1')]);
const expected = crypto.createHmac('sha256', secret).update(signed).digest('base64');
```

```python
# Python
signed = b"".join([raw_body, b".", nonce.encode("latin-1"), b".", timestamp.encode("latin-1")])
expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
```

Steps:

1. Read the raw body (Express `express.raw({ type: '*/*' })`, Next.js `await request.arrayBuffer()`, FastAPI `await request.body()`).
2. Require all three headers to be present and non-empty, else 401.
3. Require the signature to match `[A-Za-z0-9+/]{43}=` (44 padded base64 characters), else 401. Compare the WHOLE header value as one digest: no list splitting, no prefix parsing.
4. Compute the HMAC and compare in constant time (Node: equal-length buffers with `crypto.timingSafeEqual`; Python: `hmac.compare_digest` on bytes, with `base64.b64decode(..., validate=True)` followed by a re-encode check, since decoders ignore stray low bits in the last character and Hookdeck compares base64 exactly).
5. Respond `200` if valid, `401` otherwise. Parse JSON only after this check.

Header values are encoded latin-1 exactly as received; they are never trimmed, parsed or re-formatted.

## Published Test Vector

Sinch's docs give a worked example, included as a unit test in every example (Express, Next.js, FastAPI):

- Secret: `foo_secret1234`
- `x-sinch-webhook-signature-nonce`: `01FJA8B4A7BM43YGWSG9GBV067`
- `x-sinch-webhook-signature-timestamp`: `1634579353`
- Expected `x-sinch-webhook-signature`: `6bpJoRmFoXVjfJIVglMoJzYXxnoxRujzR4k2GOXewOE=`
- Body (exact bytes, no trailing newline):

```
{"app_id":"","accepted_time":"2021-10-18T17:49:13.813615Z","project_id":"e2df3a34-a71b-4448-9db5-a8d2baad28e4","contact_create_notification":{"contact":{"id":"01FJA8B466Y0R2GNXD78MD9SM1","channel_identities":[{"channel":"SMS","identity":"48123456789","app_id":""}],"display_name":"New Test Contact","email":"new.contact@email.com","external_id":"","metadata":"","language":"EN_US"}},"message_metadata":""}
```

The vector matches Hookdeck's Sinch source template `{body}.{header:x-sinch-webhook-signature-nonce}.{header:x-sinch-webhook-signature-timestamp}`.

## Should I Reject Old Timestamps?

Not by default. Hookdeck retries and replays resend the **original** headers and timestamp, so a fixed window rejects legitimate redeliveries, and Hookdeck's Sinch source applies no tolerance.

The examples therefore leave the window **off** and offer an opt-in: set `SINCH_WEBHOOK_TOLERANCE_SECONDS=300` (unset or `0` = off). The timestamp header is Unix seconds. Because Sinch dedup is best-effort, deduplicate on a stable id from the payload (for example `message.id`) instead.

## Common Gotchas

- **Body first.** The order is body, nonce, timestamp, joined by dots, not timestamp-first as in Stripe-style schemes.
- **Raw body only.** Never `JSON.parse`/`JSON.stringify` (or decode and re-encode the body to a string) before verifying.
- **Content type.** Use `express.raw({ type: '*/*' })` so the exact bytes are read whatever the content type.
- **`Buffer.from(sig, 'base64')` drops invalid characters.** Validate length and alphabet first.
- **Base64 is case-sensitive.** Compare exactly.
- **Secret as UTF-8.** Do not decode it.
- **No secret, no signature.** If the webhook has no `secret`, callbacks are unsigned.
- **Other Sinch APIs differ.** SMS, Voice, Numbers and Verification callbacks use other schemes.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong `SINCH_WEBHOOK_SECRET`, or the webhook has no secret |
| 401 only behind a proxy/framework | Body was parsed and re-serialized before verifying |
| 401 with timestamp-first code | Signed `timestamp.body` instead of `body.nonce.timestamp` |
| 401 after enabling tolerance | Timestamp older than the window, or a retry after the window |
| Callbacks from SMS/Voice APIs fail | Those APIs are not Conversation API callbacks |
