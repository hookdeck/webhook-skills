# Tiltify Signature Verification

## How Does Tiltify Sign Webhooks?

Tiltify signs every delivery with HMAC-SHA256 and sends the result in `X-Tiltify-Signature`.

| Part | Value |
|------|-------|
| Signature header | `X-Tiltify-Signature`: standard base64 (padded, 44 characters), no prefix |
| Timestamp header | `X-Tiltify-Timestamp`: ISO-8601, e.g. `2023-04-18T16:49:00.617031Z` |
| Algorithm | HMAC-SHA256 |
| Signed content | `<X-Tiltify-Timestamp>.<raw request body>` |
| Key | The endpoint's Secret Webhook Signing Key (64 hex characters) as UTF-8 text, **not** hex-decoded |

Build the signed message as bytes: the header value encoded latin-1 (never trimmed or reformatted), a literal `.`, and the raw body bytes exactly as received. Never decode the body to a string and re-encode it, and never `JSON.parse`/`JSON.stringify` before verifying.

## Implementation

Tiltify has no webhook SDK, so verification is manual in every framework.

### Node.js

```javascript
const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest('base64');

if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;   // exact length and alphabet
return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); // compare the base64 text
```

Validate the format first, then compare the base64 text rather than decoded bytes: `Buffer.from(x, 'base64')` silently drops bad characters, and both Node and Python ignore stray low bits in the last character, while Hookdeck compares the base64 string exactly.

### Python

```python
signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
expected = base64.b64encode(hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest())

if not re.fullmatch(r"[A-Za-z0-9+/]{43}=", signature):
    return False
return hmac.compare_digest(expected, signature.encode("ascii"))  # compare the base64 text
```

Compare bytes, never `str`, with `hmac.compare_digest`.

## Does Tiltify Publish a Test Vector?

Yes. Tiltify's [Verifying Signature](https://developers.tiltify.com/docs/webhooks/receiving-webhooks/verifying) page has a worked example with real values, and every example's test suite includes it:

| Input | Value |
|-------|-------|
| Secret | `13c3b68914487acd1c68d85857ee1cfc308f15510f2d8e71273ee0f8a42d9d00` |
| `X-Tiltify-Timestamp` | `2023-04-18T16:49:00.617031Z` |
| Body | the compact `public:direct:donation_updated` JSON from the docs (donor `Jirachi`, amount `82.95`) |
| Expected signature | `4OSwlhTt0EcrlSQFlqgE18FOtT+EKX4qTJdJeC8oV/o=` |

It confirms the key is the 64-character hex string used as UTF-8 text. If your implementation doesn't reproduce that signature from those inputs, it is wrong.

## Should I Enforce a Timestamp Window?

Tiltify says the timestamp should be recent (within a minute). The examples don't enforce it by default: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck applies no tolerance, so a fixed window would reject legitimate retries (Tiltify itself retries for about an hour). To opt in, set `TILTIFY_WEBHOOK_TOLERANCE_SECONDS` (for example `300`); unset or `0` is off. With it on, the timestamp must be a valid ISO-8601 UTC value, and anything farther than the tolerance from now is rejected with `401`. Deduplicating on `meta.id` protects against replays regardless.

## Common Gotchas

- **Raw body**: re-serialised JSON changes spacing and key order, so the signature fails. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **Hex key**: the secret looks like hex but is used as UTF-8 text. Don't decode it.
- **Base64, not hex**: the digest is padded standard base64 and compared case-sensitively.
- **Whole header**: there is no prefix or list; the entire header value is the digest.
- **Timestamp is signed**: if a proxy rewrites or drops `X-Tiltify-Timestamp`, verification fails.
- **Missing or empty headers**: respond `401`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Wrong secret, or the secret was hex-decoded |
| Works for the docs vector but not live | Body parsed and re-serialised, or a middleware changed the bytes |
| `Malformed X-Tiltify-Signature header` | Header is not 44-character padded base64 (truncated or altered) |
| Fails only after a retry | A tolerance is set; unset `TILTIFY_WEBHOOK_TOLERANCE_SECONDS` |
| Endpoint stopped receiving events | Tiltify deactivated it after 12 failed retries; re-enable it |
