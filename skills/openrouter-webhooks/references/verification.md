# How to Verify OpenRouter Webhook Signatures

## How Does OpenRouter Sign Webhooks?

OpenRouter video-generation callbacks carry one signature header:

```
X-OpenRouter-Signature: t=<unix seconds>,v1=<hex>
```

- **Algorithm:** HMAC-SHA256, output as lowercase hex (64 characters)
- **Key:** the workspace webhook signing secret, its UTF-8 bytes used as-is (not hex- or base64-decoded)
- **Signed message:** the `t` value from the header, then a literal comma `,` (not a dot), then the raw request body bytes: `"<t>," + rawBody`
- **Not Standard Webhooks:** there are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers
- **No official verification SDK helper**, so verification is manual in all three examples

## How Do I Implement It?

Build the signed message as **bytes**:

```javascript
// Node.js
const signed = Buffer.concat([Buffer.from(`${t},`, 'latin1'), rawBody]);
const expected = crypto.createHmac('sha256', secret).update(signed).digest();
```

```python
# Python
signed = b"".join([t.encode("latin-1"), b",", raw_body])
expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
```

Steps:

1. Read the raw body (Express `express.raw({ type: '*/*' })`, Next.js `await request.arrayBuffer()`, FastAPI `await request.body()`).
2. Split the header on `,`; take the `t=` value and every `v1=` value. Missing `t` or `v1` → 401.
3. Compute the HMAC over `t`, `,`, raw body.
4. For each `v1`: require exactly 64 hex characters (`[0-9a-fA-F]`), then compare in constant time against the expected digest (hex is case-insensitive, so decode both to bytes or lowercase both). Valid when any `v1` matches.
5. Respond `204` if valid, `401` otherwise. Parse JSON only after this check.

The `t` value is encoded as latin-1 bytes exactly as it appears in the header; it is never parsed to a number and re-formatted.

## Should I Reject Old Timestamps?

Not by default. OpenRouter's own receiver example rejects `t` more than 300 seconds from now, but:

- Hookdeck retries and replays resend the **original** headers and timestamp, so a fixed window rejects legitimate redeliveries.
- Hookdeck's OpenRouter source applies no tolerance.

The examples therefore leave the window **off** and offer an opt-in: set `OPENROUTER_WEBHOOK_TOLERANCE_SECONDS=300` (unset or `0` = off). `t` is Unix seconds. Deduplicate with the `X-OpenRouter-Idempotency-Key` header instead.

## Common Gotchas

- **Comma, not dot.** Stripe/Mux-style code that signs `t.body` fails here; OpenRouter signs `t,body`.
- **Raw body only.** Never `JSON.parse`/`JSON.stringify` (or decode and re-encode the body to a string) before verifying.
- **Content type.** Deliveries are `application/json`, but use `express.raw({ type: '*/*' })` so the exact bytes are read whatever the content type.
- **`Buffer.from(sig, 'hex')` drops invalid characters.** Validate length and alphabet first; compare with `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` on bytes (Python).
- **Secret as UTF-8.** Do not decode it.
- **Only callbacks are signed.** The Broadcast "Webhook" destination is unsigned.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong `OPENROUTER_WEBHOOK_SECRET`, or secret from another workspace |
| 401 only with a proxy/framework | Body was parsed and re-serialized before verifying |
| 401 with the Stripe-style code | Signed `t.body` with a dot instead of `t,body` |
| 401 after enabling tolerance | Timestamp older than the window, or a replay/retry after the window |
| Hookdeck verifies, your app doesn't | Hookdeck forwards the original headers; check you read `X-OpenRouter-Signature` unchanged |
