# Bindbee Signature Verification

## How Does Bindbee Sign Webhooks?

Bindbee uses the Standard Webhooks header layout on version 2 webhooks:

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID (equals the body's `id`) |
| `webhook-timestamp` | Unix seconds |
| `webhook-signature` | One or more space-separated `v1,<base64>` entries |

Signed content is `{webhook-id}.{webhook-timestamp}.{raw request body}`, HMAC-SHA256, base64 output. The key is the secret's **raw UTF-8 bytes**: "Sign {webhook-id}.{webhook-timestamp}.{body} with HMAC-SHA256, keyed with the secret's UTF-8 bytes" ([Bindbee docs](https://docs.bindbee.dev/guides/webhooks/verify-signatures)).

## Implementation

There is no official SDK helper to use, and the `standardwebhooks` and `svix` libraries must not be used: they base64-decode the secret, so the HMAC key would be wrong. Implement it by hand, matching Hookdeck's Standard Webhooks controller:

1. Require `webhook-id`, `webhook-timestamp` and `webhook-signature`.
2. Require the timestamp to match `/^[1-9][0-9]*$/`.
3. Key: if the secret starts with `whsec_`, base64-decode the rest; otherwise use the secret's UTF-8 bytes. Reject an empty key (fail closed). Bindbee secrets have no prefix, so the first branch only mirrors Hookdeck.
4. Compute base64 HMAC-SHA256 over the bytes `{id}.{timestamp}.` followed by the raw body bytes.
5. Split the header on spaces; accept any `v1,<sig>` entry that matches in constant time and ignore other versions (such as `v1a`).

```javascript
const expected = Buffer.from(crypto.createHmac('sha256', key).update(signed).digest('base64'));
candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
```

```python
hmac.compare_digest(candidate_bytes, expected_bytes)
```

See the full implementations in [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

## Common Gotchas

- **Raw body**: verify the exact bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.arrayBuffer()`; in FastAPI `await request.body()`. Parse JSON afterwards.
- **Do not base64-decode the secret.** Paste it exactly as the dashboard shows it.
- **Version 1 webhooks** have no `webhook-*` headers and cannot be verified by this scheme. Hookdeck's alert: "Paste the security signature secret as-is. Only version 2 webhooks are supported; version 1 webhooks lack the webhook-* headers and fail verification."
- **No timestamp window by default**: Hookdeck retries and replays resend the original timestamp, so a window would reject them. Opt in with `BINDBEE_WEBHOOK_TOLERANCE_SECONDS`.
- **Secret rotation**: regenerating the organization secret invalidates the old one immediately.
- **Hookdeck** also accepts `svix-*` prefixed headers; Bindbee sends `webhook-*`.

## Debugging Verification Failures

- `400` for every request: the secret env var is unset or empty (handlers fail closed), or the secret was changed in the dashboard.
- Valid-looking signature but mismatch: a library base64-decoded the secret, or the body was parsed and re-serialised before verifying.
- Only some deliveries fail: confirm they come from a version 2 webhook.
