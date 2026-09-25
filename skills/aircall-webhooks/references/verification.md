# How to Verify Aircall Webhooks

## Aircall Does Not Use Signatures

**There is no HMAC, no signature header, and no cryptographic verification.**

Aircall authenticates webhooks with a **shared secret carried in the request body**. Every
event payload contains a top-level `token` string equal to the token issued when the
webhook was created. You verify by comparing that string to the token you stored.

Aircall's API reference documents `token` as: *"Token associated to the Webhook. Use it to
identify from which Aircall account a Webhook event is sent from."*

### What does NOT exist

| Commonly assumed | Reality |
|------------------|---------|
| `X-Aircall-Signature` header | Does not exist |
| HMAC-SHA256 / HMAC-SHA1 over the raw body | Not used — nothing is hashed |
| Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`) | Not used |
| Timestamp tolerance / replay window | No replay protection exists |
| IP allowlist | Aircall publishes no static IPs |

### What Aircall does send

A live `contact.updated` delivery (September 2026) carried only these headers:

| Header | Value |
|--------|-------|
| `content-type` | `application/json` |
| `user-agent` | `axios/<version>` |
| `aircall-origin` | `webhooks` |
| `x-datadog-trace-id`, `x-datadog-parent-id`, `tracestate` | Tracing IDs that change per request |

`aircall-origin` is undocumented. None of these headers is a credential, so don't
authenticate on them. The only secret is the body `token`.

Aircall's full server-rendered API reference contains **zero** occurrences of "hmac" or
"sha256". The only two matches for "signature" anywhere in it are `X-Amz-Signature` inside
an S3 presigned download URL in an *analytics export* payload — unrelated to webhook
verification.

Third-party blog posts describing an `X-Aircall-Signature` HMAC header are **wrong**. Do
not implement or cite them.

Aircall's own docs loosely label this "verifying webhook signatures" in a code comment,
and their sample is a bare `token !== process.env.AIRCALL_WEBHOOK_TOKEN`. The mechanism is
still a plain shared-secret comparison — the wording should not pull you toward an HMAC
template. This skill uses a **constant-time** compare instead of `!==`, matching the
convention used for other token-based providers in this repo (GitLab, Hugging Face).

## Why a Timing-Safe Comparison

A naive `===` / `!=` comparison short-circuits on the first differing byte, so response
time leaks how many leading characters an attacker guessed correctly. That makes the token
recoverable byte by byte over many requests. Constant-time comparison removes the signal
and costs nothing.

## Implementation

There is no Aircall SDK for webhook verification (nothing to verify cryptographically), so
every framework uses the same few lines from the standard library.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyAircallWebhook(payloadToken, expectedToken) {
  if (typeof payloadToken !== 'string' || !expectedToken) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(payloadToken),
      Buffer.from(expectedToken)
    );
  } catch {
    // timingSafeEqual throws when lengths differ — that's simply a mismatch
    return false;
  }
}
```

Usage:

```javascript
const { resource, event, timestamp, token, data } = req.body;

if (!verifyAircallWebhook(token, process.env.AIRCALL_WEBHOOK_TOKEN)) {
  return res.status(401).send('Unauthorized');
}
```

### Python (FastAPI)

```python
import secrets

def verify_aircall_webhook(payload_token: str | None, expected_token: str | None) -> bool:
    if not payload_token or not expected_token:
        return False
    return secrets.compare_digest(payload_token, expected_token)
```

`secrets.compare_digest` handles differing lengths without raising.

## Raw Body Is Not Required

For HMAC providers (Stripe, GitHub, Shopify) you must verify against the **raw** body,
because re-serializing JSON changes the bytes and breaks the signature.

Aircall has no signature over the bytes — the secret is a field *inside* the JSON. Parsing
the body first is safe and correct. `express.json()`, `await request.json()`, and
`await request.json()` in FastAPI are all fine.

This is the one place where copying a Stripe-style handler leads you astray: there is no
need for `express.raw()` or `bodyParser.raw()` here.

## Security Properties and Their Limits

Know what this scheme does and does not give you:

| Property | Provided? |
|----------|-----------|
| Authenticates the sender | Yes — only Aircall and you know the token |
| Identifies which Aircall account sent the event | Yes — that's the token's documented purpose |
| Integrity of the payload | **No** — nothing is signed; a MITM could alter `data` |
| Replay protection | **No** — a captured payload replays forever |

Practical consequences:

1. **HTTPS is mandatory** — the token travels in cleartext in the body. Aircall enforces
   this: the URL must be behind a valid SSL certificate and start with `https`.
2. **Never log the full payload at info level in production** — the token is in it. Redact
   `token` before logging.
3. **Do not build a timestamp-tolerance check.** `timestamp` is unsigned metadata; an
   attacker replaying a captured payload keeps its original timestamp anyway, and legitimate
   retries (up to 50, over as much as 12 hours) would be rejected. Deduplicate on the
   resource id instead.
4. **Rotate by recreating the webhook** if a token is exposed — Aircall issues the token at
   creation.

## Multi-Tenant Verification

If you serve many Aircall accounts through one endpoint, the token is also your tenant
key. Look the tenant up **by** the token rather than comparing against a single value —
but still compare in constant time, and never build a response that reveals whether a
token merely existed.

```javascript
// Constant-time lookup across known tenants
function resolveTenant(payloadToken, tenantsByToken) {
  if (typeof payloadToken !== 'string') return null;
  let match = null;
  for (const [token, tenant] of tenantsByToken) {
    if (verifyAircallWebhook(payloadToken, token)) {
      match = tenant;
    }
  }
  return match;
}
```

Note the loop deliberately does not `break` early, so timing does not reveal *which*
tenant matched. For a large tenant set, prefer a hashed-index lookup (e.g. compare against
`sha256(token)` in a map) over a linear scan.

## Common Gotchas

- **Looking for a signature header.** There isn't one. If your code reads
  `req.headers['x-aircall-signature']`, it will always be `undefined` and you will reject
  every valid event.
- **Using the API credentials as the webhook token.** `api_id`/`api_token` (or the OAuth
  access token) manage webhooks; `webhook.token` verifies events. They are different
  secrets.
- **Missing token after Dashboard creation.** The Dashboard doesn't show the token. Fetch
  it with `GET /v1/webhooks/{webhook_id}`.
- **Plain `!==` comparison.** Works, but leaks timing. Use the constant-time compare.
- **`crypto.timingSafeEqual` throwing.** It throws on length mismatch — always wrap it in
  `try/catch` and treat the throw as a rejection.
- **Reading `token` before checking the body parsed.** A malformed body means `req.body`
  may be `undefined`; guard before destructuring.
- **Trusting `resource` for routing newer events.** `resource` was documented as
  `number`/`user`/`contact`/`call`; newer families use additional values. Switch on
  `event` (or its prefix) instead.

## Choosing the Right Status Code

| Situation | Status | Why |
|-----------|--------|-----|
| Verified and accepted | `200` | Anything else counts as a failure toward the 50-retry disable limit |
| Missing or wrong `token` | `401` | Not from Aircall (or misconfigured) |
| Malformed JSON / missing envelope fields | `400` | Aircall will retry; genuinely broken payloads shouldn't 200 silently |
| Your own processing blew up | `500` | Aircall retries — but see the warning below |

**Warning specific to Aircall:** every non-2xx counts toward automatic deactivation.
Returning `500` because your *downstream* database was briefly down can, if sustained,
disable the webhook entirely. Verify the token, enqueue the work, and return `200` — then
handle downstream failures with your own retry logic rather than Aircall's.

## Debugging Verification Failures

**Every event returns 401**

- Confirm you're comparing `req.body.token`, not a header.
- Confirm `AIRCALL_WEBHOOK_TOKEN` holds `webhook.token`, not your API token.
- Confirm the env var is actually loaded (`console.log(!!process.env.AIRCALL_WEBHOOK_TOKEN)`).
- Check for whitespace/newlines from copy-paste — `.trim()` the stored value.
- If you have several webhooks, confirm you stored the token for *this* one; each webhook
  has its own.

**Verification passes locally but fails in production**

- Different webhook (and therefore different token) per environment.
- Secret manager truncating or wrapping the value.

**Aircall disabled my webhook**

- Check the Dashboard notification. Re-enable via `PUT /v1/webhooks/{webhook_id}`.
- Look for handlers that exceed the 5-second timeout — a slow handler fails just as
  surely as an erroring one.

**Duplicate processing**

- Expected. Delivery is at-least-once and unordered. Upsert on `data.id` (for calls,
  `call.id`) rather than inserting.

## References

- [Setup webhooks](https://developer.aircall.io/docs/setup-webhooks)
- [Webhooks overview](https://developer.aircall.io/docs/webhooks-overview)
- [API reference](https://developers.aircall.io/api-references)
