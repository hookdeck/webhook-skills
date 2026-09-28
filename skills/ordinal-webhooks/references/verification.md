# How to Authenticate Ordinal Webhooks (There Is No Signature)

## Ordinal Does Not Sign Webhook Deliveries

**There is nothing to verify cryptographically.** Verified against the rendered Ordinal
docs — the webhooks introduction, the event types page, every per-event payload page, and
the Create/Get/Update webhook API reference — there is:

- **no signature header** (no `X-Ordinal-Signature`, no `Ordinal-Signature`, no
  `webhook-signature`)
- **no signing secret** and no `whsec_` key — the `POST /webhooks` response returns only
  `id`, `name`, `url`, `topics`, `createdAt`
- **no timestamp header** and therefore no replay window
- **no HMAC of any kind**
- **no Svix / Standard Webhooks headers** (`webhook-id` / `webhook-timestamp` /
  `webhook-signature`)

So **do not write an HMAC verifier.** No `crypto.createHmac`, no `hmac.new`, no
`timestamp.body` signed string. There are no inputs for it, and a fabricated verifier
rejects 100% of genuine deliveries while looking correct in review.

Hookdeck's own `ORDINAL` source type corroborates this: verification is **optional**, and
the only checks offered are the generic **Basic Auth** and **API Key** (header name +
value) ones — both of which validate a *static* header. Hookdeck cannot offer HMAC for
Ordinal because no body-dependent signature exists.

## The Only Authentication Mechanism: A Static Custom Header

The Ordinal webhook object has an optional `headers` field, documented verbatim as
*"Optional custom headers to include in webhook requests"* — a JSON object of header name →
value that Ordinal attaches to every delivery. `GET /webhooks/{id}` returns
`headers: object | null`. The docs' own example is:

```json
"headers": { "X-Custom-Header": "value" }
```

So the pattern is a **shared secret you supply**:

1. Generate a long random secret: `openssl rand -hex 32`.
2. Create or patch the webhook with
   `"headers": { "X-Webhook-Secret": "<your secret>" }`. **The header name is your
   choice — it is not an Ordinal-defined header.** These examples read
   `x-webhook-secret`, configurable via `ORDINAL_WEBHOOK_SECRET_HEADER`.
3. In the handler, compare the incoming header against `ORDINAL_WEBHOOK_SECRET` using a
   **constant-time compare**. Return `401` on mismatch or when the header is absent.
4. **Fail closed:** if `ORDINAL_WEBHOOK_SECRET` is unset, reject (`500`) or refuse to
   start. Never fall through to accepting everything.

### What This Does and Does Not Give You

| Property | Signed webhooks (Stripe, GitHub) | Ordinal's static header |
|----------|----------------------------------|-------------------------|
| Proves the caller knows a secret | Yes | **Yes** |
| Proves the body was not modified in transit | Yes (HMAC covers the body) | **No — nothing is signed over the body** |
| Detects replay of an old delivery | Yes (timestamp + window) | **No — the value is identical every time** |
| Survives disclosure of one delivery | Yes (signature is per-body) | **No — one captured header is the secret forever** |

It is a **channel** check, not integrity protection: only as good as TLS and your secret
hygiene. Treat the header value like a password — never log it, never put it in a URL, and
rotate it by `PATCH /webhooks/{id}` (see [setup.md](setup.md)).

## No Raw-Body Requirement

Because nothing is signed over the body, **there is no raw-body requirement**. Parsing JSON
before authenticating is fine on an Ordinal route:

- `express.json()` mounted on the route is safe
- `await request.json()` before the header check is safe
- FastAPI Pydantic body models / `await request.json()` are safe

This is the **opposite** of signed providers. With Stripe, Shopify, GitHub or any Svix
source, a body parser running before verification re-serializes the JSON and breaks the
HMAC, so you must capture raw bytes. That discipline is unnecessary here — and mentioning
"raw body" in an Ordinal handler is a sign the code was copied from a signed provider.

Authenticate before you *act* on the payload regardless; the order of parse vs. check is
what is relaxed, not the requirement to check.

## Implementation

There is **no official Ordinal SDK** (npm or pip), so every implementation below is a
plain constant-time comparison — nothing is being hand-rolled that an SDK would do better.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

const SECRET_HEADER = (process.env.ORDINAL_WEBHOOK_SECRET_HEADER || 'x-webhook-secret')
  .toLowerCase();

function verifyOrdinalSecret(headers, expected) {
  // FAIL CLOSED: an unconfigured secret is a rejection, never "accept all".
  if (!expected) return false;
  const provided = headers[SECRET_HEADER]; // Node lowercases inbound header names
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual THROWS on length mismatch — compare lengths first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

In Next.js App Router, read it with `request.headers.get(SECRET_HEADER)` — the `Headers`
lookup is already case-insensitive.

### Python (FastAPI)

```python
import hmac
import os

SECRET_HEADER = os.getenv("ORDINAL_WEBHOOK_SECRET_HEADER", "x-webhook-secret").lower()


def verify_ordinal_secret(provided: str | None, expected: str | None) -> bool:
    # FAIL CLOSED: an unconfigured secret is a rejection, never "accept all".
    if not expected:
        return False
    if not provided:
        return False
    # Compare BYTES, not str: hmac.compare_digest() raises TypeError on str
    # values containing non-ASCII characters, and the header is attacker-supplied.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
```

`hmac.compare_digest` is the constant-time comparison here — it is **not** computing an
HMAC. Starlette's `request.headers` is case-insensitive.

### Basic Auth Alternative

Instead of a custom header you could put
`"Authorization": "Basic <base64(user:pass)>"` in `headers` and check that. **The docs do
not say whether `Authorization` (or other reserved header names) may be overridden via
`headers`**, so treat the custom `X-` header as the primary path and Basic Auth as an
alternative *if Ordinal accepts an `Authorization` custom header*. If you go that route,
still compare in constant time, and compare the decoded credentials rather than the
base64 string only if you need the username separately.

## Status Codes

| Situation | Code | Why |
|-----------|------|-----|
| Authenticated and handled | `200` (any 2xx) | Docs: *"Your endpoint should respond with a `2xx` status code to acknowledge receipt"* |
| Secret header missing or mismatched | `401` | It is an authentication failure, not a malformed request |
| Body is not valid JSON (after auth) | `400` | Malformed request |
| `ORDINAL_WEBHOOK_SECRET` not configured | `500` | Server misconfiguration — distinguishable from a bad secret in your logs |

Returning `401` rather than `400` for a bad secret keeps "someone is probing my endpoint"
separable from "Ordinal sent me something I could not parse".

## Common Gotchas

- **Do not write an HMAC verifier.** There is no secret to key it with and no signature to
  compare against. This is the single biggest failure mode for this provider.
- **`ORDINAL_API_KEY` is not a webhook secret.** The workspace API key is what *you* send
  to Ordinal as `Authorization: Bearer <key>` when calling `https://app.tryordinal.com/api/v1`.
  It never arrives inbound — never compare a delivery against it.
- **Never default to "allow" when the secret is unset.** `if (!expected) return true` turns
  a misconfigured deploy into a fully open endpoint. Fail closed.
- **`crypto.timingSafeEqual` throws on length mismatch.** Guard with a length comparison
  first, or an attacker-supplied short header becomes an uncaught 500.
- **`hmac.compare_digest` raises `TypeError` on non-ASCII `str`.** Encode both sides to
  bytes.
- **Do not use `===` / `==`.** String comparison short-circuits on the first differing byte
  and leaks the secret prefix through timing.
- **Header names arrive lowercased** in Express (`req.headers['x-webhook-secret']`) and
  Starlette. `req.headers['X-Webhook-Secret']` is `undefined` in Express.
- **A missing header is not an empty string.** Check the type before comparing, or
  `Buffer.from(undefined)` throws.
- **Don't reach for raw body.** There is no signature over it — see above.
- **There is no event id to dedupe on.** No top-level id in the envelope and no
  delivery-id header. Derive your own key from `type` + the resource id inside `data` +
  `createdAt` if you need idempotency, and document it as your convention rather than
  Ordinal's.
- **There is no IP allowlist.** Ordinal publishes no source IP ranges — do not fabricate
  one as a substitute for the header check.
- **There is no `ping` / test event.** Don't write a branch for one.

## Debugging Authentication Failures

| Symptom | Likely cause |
|---------|--------------|
| Every delivery returns `401` | The webhook's `headers` object was never set (a dashboard-created webhook may have none — `PATCH /webhooks/{id}` to add it), or the header name in `ORDINAL_WEBHOOK_SECRET_HEADER` differs from the one in `headers` |
| Every delivery returns `500` | `ORDINAL_WEBHOOK_SECRET` is unset in the running process — this is the fail-closed path working correctly |
| Works locally, `401` in production | The secret env var was not deployed, or a proxy/CDN is stripping unknown `X-` headers before your app sees them |
| `GET /webhooks/{id}` shows `headers: null` | The header was never persisted. Remember the **Create response omits `headers`**, so a successful `POST` that looks like it dropped them may actually be fine — confirm with `GET`, not the `POST` response |
| Uncaught `TypeError` / 500 on odd requests | Comparing before checking that the header exists and lengths match |
| You are trying to compute a signature and nothing matches | There is no signature. Stop. Check the static header instead |
