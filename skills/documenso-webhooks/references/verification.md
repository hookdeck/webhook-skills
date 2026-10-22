# How to Verify Documenso Webhooks

## How Does Documenso Authenticate Webhooks?

It doesn't sign them. There is no HMAC, no timestamp and no signature header. When a webhook
has a secret, Documenso copies that secret, unchanged, into the `X-Documenso-Secret` header of
every request:

```http
POST /webhooks/documenso HTTP/1.1
Content-Type: application/json
X-Documenso-Secret: your_webhook_secret_here

{"event":"DOCUMENT_COMPLETED","payload":{...},"createdAt":"...","webhookEndpoint":"..."}
```

The setup page says the secret is "used to sign the payload"; the verification page and actual
behavior are a plain shared token. The body is not covered, so use HTTPS and treat the secret
like a password.

## Implementation

Compare the header with your stored `DOCUMENSO_WEBHOOK_SECRET` in constant time. Hash both sides
(or check lengths first) so `crypto.timingSafeEqual` never throws on a length mismatch.

```javascript
function verifyDocumensoSecret(received, expected = process.env.DOCUMENSO_WEBHOOK_SECRET) {
  if (!expected) return false;
  if (!received) return false;
  return safeEqual(received, expected); // sha256 both sides, then crypto.timingSafeEqual
}
```

```python
def verify_documenso_secret(received, expected):
    if not expected or not received:
        return False
    return hmac.compare_digest(
        hashlib.sha256(received.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )
```

## Common Gotchas

- **Empty header.** A webhook created without a secret sends `X-Documenso-Secret: ` (empty).
  Documenso's own sample code skips verification when no secret is configured; don't. Reject an
  empty header and fail closed when `DOCUMENSO_WEBHOOK_SECRET` is unset, otherwise anyone can
  post to your endpoint (an empty header would equal an empty expected secret).
- **Don't compute an HMAC.** Nothing is signed, so an HMAC-SHA256 of the body never matches.
- **No raw body needed.** Authenticate first, then parse. In Express use
  `express.raw({ type: '*/*' })` so the handler runs whatever `Content-Type` arrives.
- **Plain `===` leaks timing.** Use `timingSafeEqual` / `compare_digest`.
- **Header casing.** Node lowercases header names: read `x-documenso-secret`.
- **No replay protection.** There is no timestamp or delivery ID, so deduplicate in your handler.
- **Secret rotation.** Editing the webhook's secret takes effect immediately; update
  `DOCUMENSO_WEBHOOK_SECRET` at the same time or deliveries get 401 and are retried.

## How to Debug 401s

| Symptom | Cause | Fix |
|---------|-------|-----|
| Always 401, header empty in logs | Webhook has no secret | Add a secret to the webhook in Team settings |
| Always 401, header present | Env var differs from the dashboard (whitespace, quotes, old value) | Re-copy the secret; check for a trailing newline in `.env` |
| 401 only locally | `DOCUMENSO_WEBHOOK_SECRET` not loaded | Check `.env` and that dotenv runs before the handler |
| 401 after rotating the secret | App still has the old value | Update the env var and redeploy |

The **Test** button and the call log (request headers and response code) show exactly what
Documenso sent.
