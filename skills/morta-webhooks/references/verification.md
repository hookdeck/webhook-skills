# How to Verify Morta Webhook Signatures

## How Does Morta Sign Webhooks?

Every webhook carries one header:

```
Morta-Signature: t=1234567890,v1=5ab0811a0d362f7becff116ce7b232c3ef61400d01911c50c03183a44d4cb00c
```

- `t` is the event timestamp in Unix seconds.
- `v1` is the lowercase hex HMAC-SHA256 of `<t>.<raw body>`, keyed with your hub signing secret
  (Hub > Settings > Secrets) as UTF-8 text.

Morta provides no verification SDK; its docs show a manual Python/Flask sample. All three examples
here verify manually.

## How to Implement Verification

1. Read the header; if it is missing or empty, answer `401`.
2. Split on `,`, then on the first `=`. Take `t` and every `v1`. Ignore other keys (such as `v0`).
   A header with no `t` fails.
3. Check each `v1` is exactly 64 hex characters (`[0-9a-fA-F]{64}`) and lowercase it. Drop the ones
   that aren't. If none remain, fail.
4. Build the message as **bytes**: the `t` string exactly as it appears in the header, a literal
   `.`, then the raw body bytes.
5. Compute HMAC-SHA256 with the secret's UTF-8 bytes. Hex-encode it.
6. Compare in constant time against each `v1`. Accept if any match.

```javascript
const expected = Buffer.from(
  crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
);
const ok = sigs.some((sig) => crypto.timingSafeEqual(Buffer.from(sig), expected));
```

```python
expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
ok = any(hmac.compare_digest(sig.encode(), expected) for sig in signatures)
```

The header can carry more than one `v1` (for example during key rotation). The hex comparison is
case-insensitive, as Hookdeck's Morta source does it.

## Should I Reject Old Timestamps?

Not by default. Hookdeck retries and replays resend the original headers, including the original
`t`, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate
redeliveries. If you receive webhooks directly and want replay protection, set
`MORTA_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`). Unset or `0`
turns it off. `t` is Unix seconds.

## Common Gotchas

- **Use the raw body.** Don't `JSON.parse`/`JSON.stringify`, or decode and re-encode, before
  verifying. Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`.
  FastAPI: `await request.body()`.
- **Keep `t` a string.** Never parse it to a number and format it again: `0001700000000` and
  `1700000000` sign differently.
- **Validate before decoding.** Don't call `Buffer.from(sig, 'hex')` on an unvalidated value: it
  silently drops bad characters. Check length and alphabet first, compare bytes (`compare_digest` on
  `bytes`, never `str`).
- **Secret is not encoded.** Use it as UTF-8 bytes, not hex- or base64-decoded.
- **`change` is double-encoded.** It's a JSON string inside the JSON body; parse it again, and
  tolerate `null` or bad data.
- **Treat parsed fields as untrusted.** After verifying, check each field's type
  (`typeof`/`Array.isArray`, `isinstance`) before reading into it, so a wrong-typed field is ignored
  or answered with `400`, never a `500`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails | Wrong secret (use the hub's signing secret from Hub > Settings > Secrets), or a body parser consumed the raw bytes |
| Fails only for some payloads | Body re-serialized (whitespace, key order, unicode escaping) before verifying |
| Fails after proxying | A proxy changed the body or dropped the `Morta-Signature` header |
| Old deliveries fail | `MORTA_WEBHOOK_TOLERANCE_SECONDS` is set; unset it to accept retries and replays |

Status codes: `401` for a missing, empty, malformed, or mismatched signature; `400` for a verified
body that isn't a JSON object; `500` if the secret isn't configured.
