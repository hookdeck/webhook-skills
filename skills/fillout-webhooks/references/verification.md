# How to Verify Fillout Webhooks

## Does Fillout Sign Webhooks?

No. Fillout's webhook docs describe no signature header, signing secret, timestamp or
HMAC, and the REST API's create-webhook response returns only an `id`. There's nothing
to compute a signature from. Don't write an HMAC verifier for Fillout.

## How Does Fillout Webhook Authentication Work?

You add a custom header in the webhook's **Advanced → Headers** section. Fillout's docs
give the typical form:

```
Authorization: Bearer <secret_token>
```

Fillout sends that header, unchanged, on every delivery. Your endpoint checks that the
header matches what you configured.

| Item | Value |
|------|-------|
| Header | `Authorization` (you could choose another name, but these examples use `Authorization`) |
| Expected value | `Bearer ` + `FILLOUT_WEBHOOK_TOKEN` |
| Algorithm | Constant-time equality of the whole header value. No hashing scheme from Fillout |
| Signed content | None |
| Raw body needed? | No |
| Timestamp / replay window | None |

## Why Compare the Whole Header Value?

Compare the full string `Bearer <token>`, not a token you've split out of it. The scheme
prefix is part of what you configured, and splitting on spaces adds parsing edge cases
(double spaces, lowercase `bearer`, missing prefix) that a plain equality check avoids.
Hookdeck's Fillout source does the same: its Header Value field takes the whole value.

Use a constant-time comparison so response timing doesn't leak how much of the value
matched. Hashing both sides with SHA-256 first gives equal-length inputs, so you don't
need a separate length check.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyFilloutAuth(authorizationHeader, token) {
  if (!token) return false; // fail closed
  if (typeof authorizationHeader !== 'string') return false;
  const a = crypto.createHash('sha256').update(authorizationHeader).digest();
  const b = crypto.createHash('sha256').update(`Bearer ${token}`).digest();
  return crypto.timingSafeEqual(a, b);
}
```

- Express: `req.headers.authorization` (Node lowercases header names).
- Next.js App Router: `request.headers.get('authorization')`, which returns `null` when
  the header is absent.

### Python (FastAPI)

```python
import hmac

def verify_fillout_auth(authorization: str | None, token: str | None) -> bool:
    if not token or authorization is None:
        return False
    return hmac.compare_digest(
        authorization.encode("utf-8"), f"Bearer {token}".encode("utf-8")
    )
```

`hmac.compare_digest` handles different lengths safely (it returns `False`).

### SDK?

Fillout has no official webhook SDK for Node.js or Python, and there's nothing for one to
verify. All three examples use the standard library.

## What Status Codes Should I Return?

| Situation | Status |
|-----------|--------|
| `FILLOUT_WEBHOOK_TOKEN` not set on the server | `500` (fail closed, it's a server misconfiguration) |
| `Authorization` header missing or wrong | `401` |
| Body isn't valid JSON | `400` |
| Processed | `200` |

## Common Gotchas

- **The header only exists in Advanced mode.** A Simple-mode webhook has no Headers
  section, so it arrives without `Authorization` and gets `401`.
- **Advanced mode replaces the body.** Fillout stops sending the full submission and
  sends only the keys you mapped. Map `submissionId` → Submission ID.
- **API-created webhooks can't carry headers.** `POST /webhook/create` takes only
  `formId` and `url`.
- **Store the token without `Bearer `.** `FILLOUT_WEBHOOK_TOKEN` is the bare token; the
  code adds the prefix. Putting `Bearer ` in both places gives `Bearer Bearer ...`.
- **Whitespace.** A trailing space or newline pasted into Fillout's header value makes
  every comparison fail. Re-type the value if the test request gets `401`.
- **Don't confuse the API key with the webhook token.** Your Fillout API key
  (`Authorization: Bearer <api key>`) is for calling Fillout's API. Fillout never sends it
  to your endpoint. Use a separate random token for the webhook.
- **It's a shared secret, not a signature.** It proves the sender knows the token; it
  doesn't detect a modified body. Rely on HTTPS and rotate the token if it leaks (update
  Fillout, then the server).

## How Do I Debug Verification Failures?

1. Click **Test** in the Fillout webhook settings and look at the request in the Hookdeck
   CLI's web UI. Check that `Authorization` is present and reads `Bearer <token>`.
2. If it's missing, check the webhook is in **Advanced** mode and the header is under
   **Headers**, not **URL parameters** or **Cookies**.
3. If it's present but rejected, print the lengths of the received value and of
   `Bearer ${FILLOUT_WEBHOOK_TOKEN}` (never the values) to spot extra whitespace or a
   doubled `Bearer `.
4. A `500` means the server has no `FILLOUT_WEBHOOK_TOKEN`. Check your `.env` is loaded.
5. Failed deliveries show on the form's **Results** page; use **Retry integration** after
   fixing the endpoint.
