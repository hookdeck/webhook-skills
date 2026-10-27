# Bindbee Signature Verification

## How Does Bindbee Sign Webhooks?

Version 2 deliveries follow the [Standard Webhooks](https://www.standardwebhooks.com/) scheme:

| Header | Contains |
|--------|----------|
| `webhook-id` | The event ID (equals `id` in the body) |
| `webhook-timestamp` | When Bindbee sent the event, Unix seconds |
| `webhook-signature` | One or more space-separated `v1,<base64>` entries (Bindbee sends one today) |

- **Signed content:** `{webhook-id}.{webhook-timestamp}.{raw request body}`
- **Algorithm:** HMAC-SHA256, output encoded as standard base64
- **Key:** the signing secret's raw UTF-8 bytes

Hookdeck's Bindbee source also accepts the same three values under `svix-id` / `svix-timestamp` / `svix-signature` when `webhook-id` is absent, and the examples do the same.

## How Do I Verify Without a Library?

The steps the examples implement:

1. Require `webhook-id`, `webhook-timestamp` and `webhook-signature` (or the `svix-*` set when `webhook-id` is absent).
2. Require the timestamp to be a plain positive integer (`/^[1-9][0-9]*$/`).
3. Build the key: base64-decode the part after `whsec_` if the secret starts with `whsec_`, otherwise use the secret's UTF-8 bytes. Reject an empty key.
4. Compute HMAC-SHA256 over `{id}.{timestamp}.` followed by the raw body bytes, then base64-encode.
5. Split the signature header on spaces; accept if any `v1,<sig>` entry matches in constant time (Node: compare lengths, then `crypto.timingSafeEqual` on equal-length Buffers; Python: `hmac.compare_digest` on bytes). Ignore other versions such as `v1a`.
6. Only then parse the JSON.

```python
key = secret.encode("utf-8")
expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
ok = any(
    v == "v1" and hmac.compare_digest(base64.b64decode(sig), expected)
    for v, _, sig in (e.partition(",") for e in header.split(" "))
)
```

## Why Doesn't the Standard Webhooks Library Work as Documented?

The `standardwebhooks` and `svix` libraries base64-decode the secret, so a Bindbee secret pasted into them produces the wrong key and every signature fails. Bindbee's own docs work around this by building a `whsec_` secret from `base64(secret)` (Node) or passing the raw bytes (Python). These examples skip the library: it also enforces a fixed 5-minute timestamp window, and Hookdeck retries and replays resend the original timestamp.

## Does the Timestamp Matter?

Bindbee's docs suggest rejecting timestamps more than 5 minutes from your clock. The examples leave the window **off by default**, because retries and replays keep the original `webhook-timestamp`. Set `BINDBEE_WEBHOOK_TOLERANCE_SECONDS` to a positive whole number to opt in. Deduplicate on `webhook-id` instead.

## Common Gotchas

- **Raw body:** parsing then re-serializing JSON changes the bytes. Use `express.raw({ type: '*/*' })`, `request.arrayBuffer()` (Next.js) or `await request.body()` (FastAPI).
- **Secret format:** paste it as shown, with no `whsec_` prefix and no base64 encoding.
- **Version 1 webhooks** carry only the legacy `X-BINDBEE-WEBHOOK-SIGNATURE` header (HMAC-SHA256 of the body alone, URL-safe base64 with padding) and can't be verified by this scheme. Move them to version 2.
- **Regenerated secret:** every webhook fails verification at once until the new secret is deployed.
- **Status codes:** return `401` for a bad signature (Bindbee gives up) and `200` once verified. Never return a `4xx` for a temporary problem: it is final.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | A framework parsed the JSON first; or the wrong secret (Security signature card, no prefix) |
| Fails only in a library | The library base64-decoded the secret |
| Only some webhooks fail | Those webhooks are on version 1 |
| All webhooks failed at once | The secret was regenerated |
| `Timestamp too old` | `BINDBEE_WEBHOOK_TOLERANCE_SECONDS` is set and the clock is off, or a replay arrived late |
| Works locally, fails behind a proxy | The proxy re-encoded the body |
