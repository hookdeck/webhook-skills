# How to Authenticate SparkPost Webhooks

## There Is No Signature to Verify

**SparkPost event webhooks are not signed.** There is no HMAC, no signature header, and no
signing secret. If you are writing `crypto.createHmac(...)` or `hmac.new(...)` to verify a
SparkPost event webhook, you have the wrong provider or the wrong product.

Authentication is **credential-based and optional**, controlled by the webhook's `auth_type`
field. From SparkPost's *Event Webhook Authentication and Security* doc: *"The authentication
method is set to 'None' by default when creating a new webhook. To configure either Basic Auth
or OAuth 2.0, select the appropriate value from the 'Authentication' drop-down list."*

`auth_type` enum, verbatim from the API reference: **`none` | `basic` | `oauth2`**.

### What about Bird?

SparkPost is owned by Bird (formerly MessageBird), and the old
`www.sparkpost.com/docs/tech-resources/webhook-authentication/` URL now 301-redirects to Bird's
docs. **Bird's new platform webhooks are a different product**: they sign one-event-per-POST
deliveries with Standard Webhooks (`webhook-id` / `webhook-timestamp` / `webhook-signature`
headers, a `whsec_` secret, `email.delivered`-style event names). SparkPost event webhooks have
none of that. Don't implement Standard Webhooks here.

## Mode 1: Basic Authentication (recommended)

Configured on the webhook as:

```json
{
  "auth_type": "basic",
  "auth_credentials": { "username": "basicauthuser", "password": "mypassword" }
}
```

These are credentials **your endpoint** defines. The support doc says they are *"**not** your
SparkPost username and password"*, and repeats that they are not the same username and password
used to log into SparkPost.

SparkPost then sends a standard RFC 7617 header on every batch:

```http
Authorization: Basic YmFzaWNhdXRodXNlcjpteXBhc3N3b3Jk
```

### Implementation rules

1. Read the `Authorization` header (case-insensitive header lookup — every framework normalises
   this, but don't index a raw dict with `'Authorization'`).
2. Split scheme from credentials on whitespace; require the scheme to be `Basic`
   **case-insensitively** (`basic`, `BASIC` and `Basic` are all valid per RFC 7617).
3. Base64-decode the credentials. A value that isn't valid base64, or that decodes to something
   without a colon, is a rejection — not an exception.
4. Split on the **FIRST colon only**. `user:pa:ss` means username `user`, password `pa:ss`.
   Splitting on every colon breaks any password containing one.
5. Compare **both** username and password in **constant time** against
   `SPARKPOST_WEBHOOK_USERNAME` / `SPARKPOST_WEBHOOK_PASSWORD`.
6. Reject with **401**, optionally `WWW-Authenticate: Basic realm="sparkpost"`.

### Empty passwords are legitimate

The API reference marks `username` as **required** and `password` as **not required**. A webhook
configured with `{"username": "u", "password": ""}` still sends a well-formed header —
`base64("u:")` — so treat an empty password as a valid credential, not as "missing". In the
examples, an unset `SPARKPOST_WEBHOOK_PASSWORD` is normalised to `''`, and the mode is
considered configured as soon as `SPARKPOST_WEBHOOK_USERNAME` is set.

### Constant-time comparison

`crypto.timingSafeEqual` and `hmac.compare_digest` need equal-length inputs
(`timingSafeEqual` **throws** on a mismatch, which is how a length-check becomes a 500). The
safest pattern is to compare **fixed-length digests** of each side, so length itself carries no
information:

```javascript
const crypto = require('crypto');

const eq = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(a, 'utf8').digest(),
  crypto.createHash('sha256').update(b, 'utf8').digest()
);
```

```python
import hashlib, hmac

def eq(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )
```

The digests are of the credentials, not a webhook signature — this is a comparison technique,
not a verification scheme.

### Hookdeck

Hookdeck's `SPARKPOST` source verifies **Basic Auth**: it checks the incoming
`Authorization: Basic …` header against the username and password configured on the source.
Hookdeck does **not** implement the OAuth 2.0 token-URL flow, so if Hookdeck sits in front of your
handler, use `auth_type: "basic"` on the SparkPost webhook and configure the same credentials on
the Hookdeck source.

## Mode 2: OAuth 2.0 Client Credentials

Configured on the webhook as:

```json
{
  "auth_type": "oauth2",
  "auth_request_details": {
    "url": "https://example.com/oauth/token",
    "body": {
      "client_id": "CLIENT123",
      "client_secret": "9sdfj791d2bsbf",
      "grant_type": "client_credentials"
    }
  }
}
```

Per the API reference, `url` is *"The URL for the authorization server"* and `body` is *"The body
to send in the request to the authorization server. This likely should contain the client ID,
client secret, and grant type."*

### The flow

1. SparkPost POSTs that body to **your** token URL.
2. Your authorization server returns an access token.
3. SparkPost sends every batch with `Authorization: Bearer {token}`. The support-doc FAQ is
   explicit: *"the formation of this header is 'Authorization: Bearer {token}'"*.
4. Your endpoint validates the token on each request.

**When SparkPost requests a token** (FAQ): *"when we are attempting to send data to the webhook
target. We also request one when the webhook is initially created, or later modified/updated"*.

**Expiry handling** (FAQ): *"SparkPost assumes a token is expired if the webhook endpoint returns
a response of 400 or 401"*, and it will then request a new token. So **return 401 for a bad or
expired Bearer token** — that is the documented signal that triggers a token refresh. Don't
return 403.

The GET webhook response for an `oauth2` webhook shows:

```json
"auth_credentials": { "access_token": "<oauth token>", "expires_in": 3600 }
```

— i.e. your token endpoint should return a standard
`{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }` JSON response.

### Undocumented: the token request's Content-Type

SparkPost's docs do **not** state whether the token request body is sent as JSON or as
`application/x-www-form-urlencoded`. Don't assume. Make your token endpoint accept **both** —
the examples do exactly that, and the demo endpoint parses whichever arrives.

### In production, use a real authorization server

The examples include a minimal demo `POST /oauth/token` that checks `client_id` / `client_secret`
against `SPARKPOST_OAUTH_CLIENT_ID` / `SPARKPOST_OAUTH_CLIENT_SECRET`, issues a random opaque
token with an expiry, and keeps it in an in-memory map. **The in-memory store is illustrative
only** — it doesn't survive a restart and doesn't work across instances. In production you would
normally point `auth_request_details.url` at your real authorization server (Auth0, Okta,
Keycloak, …) and validate the incoming Bearer token by JWT signature verification or token
introspection (RFC 7662), replacing the examples' pluggable `validateBearerToken` function.

## Legacy: `X-MessageSystems-Webhook-Token` (deprecated)

The API reference on `auth_token`: *"Deprecated in favor of the auth_type field. Authentication
token to present in the `X-MessageSystems-Webhook-Token` header of POST requests to target."*

The support doc: *"The Header-Based Token method has been deprecated and is not available for new
webhooks"* — existing webhooks that use it keep working, and the token is still visible in the
UI. SparkPost recommends migrating to Basic Auth or OAuth 2.0.

Support it only if you have an existing webhook using it: if `SPARKPOST_WEBHOOK_TOKEN` is set,
also accept a request whose `X-MessageSystems-Webhook-Token` equals it, compared in constant
time. This is **also** how **relay webhooks** authenticate (relay webhooks have no Basic Auth
mode), so the same env var covers both.

## Custom Headers (supplementary)

`custom_headers` is *"Object of custom headers to be used during POST requests to target"* — the
docs' example is `{"x-api-key": "abcd"}`, suggested as an additional security measure. Useful as
defence in depth (or to route through a gateway), but it is a static bearer value in a header:
not a substitute for Basic Auth or OAuth 2.0. Limits, from SparkPost's "Posting Custom Headers
with Webhooks Delivery" doc: at most 5 headers, keys must be strings or numbers, and total header
size must be under 3000 bytes.

## Fail Closed

If **none** of Basic credentials, OAuth client credentials, or the legacy token are configured,
the endpoint must **reject** — `500 "Webhook authentication not configured"` (or 401). Never
accept unauthenticated batches silently just because `auth_type` defaults to `none`. The
examples use 500 for the unconfigured case (an operator problem) and 401 for bad credentials (a
caller problem), so the two are distinguishable in logs.

The examples accept **either** a valid Basic header **or** a valid Bearer token **or** (when
configured) the legacy token header, and reject everything else with 401.

## Common Gotchas

- **Don't look for a signature.** No HMAC, no `X-SparkPost-Signature`, nothing. Time spent
  hunting for one is wasted.
- **Split the decoded credentials on the first colon only** — passwords may contain colons.
- **Accept an empty password.** `password` is not a required field; `base64("user:")` is valid.
- **Match the Basic scheme case-insensitively.** RFC 7617 makes the scheme token
  case-insensitive.
- **Never let malformed base64 raise.** `Buffer.from(x, 'base64')` silently produces garbage
  (check for the colon); Python's `base64.b64decode` raises (catch it) — and the decoded bytes
  may not be valid UTF-8, so decode defensively.
- **Guard `timingSafeEqual` against length mismatches** or compare fixed-length digests.
- **Return 401, not 403**, for a bad or expired Bearer token — 400/401 is what makes SparkPost
  fetch a fresh token.
- **Return 200 for the `[{"msys":{}}]` validation batch.** Authenticate it like any other batch,
  then return 200 — never throw on the missing event class. A non-200 there blocks webhook
  creation with HTTP 400.
- **Batch ID header casing.** Look up `x-messagesystems-batch-id` case-insensitively; the support
  docs spell it `X-Messagesystems-Batch-Id`, the API reference `X-MessageSystems-Batch-ID`.
- **No SDK helper exists.** The `sparkpost` npm and `sparkpost` PyPI clients manage webhook
  *configuration*; neither has a receive/verify function. Use built-in crypto.
- **Don't hardcode SparkPost egress IPs.** Allowlist `wh.egress.sparkpost.com` if you need to.
- **Don't build on mTLS** — deprecating across all regions on 18 May 2026.

## Debugging Authentication Failures

| Symptom | Likely cause |
|---------|--------------|
| Webhook creation fails with HTTP 400 | Your endpoint didn't return 200 to the creation test POST. Deploy and confirm the handler answers 200 (including for `[{"msys":{}}]`) *before* creating the webhook. |
| `POST /webhooks/{id}/validate` shows `status: 401` | Credentials mismatch. The response echoes your endpoint's status, headers, and body — read the body you returned. |
| `POST /webhooks/{id}/validate` shows `status: 500` | Usually `timingSafeEqual` throwing on a length mismatch, or an uncaught base64/UTF-8 decode error. |
| Error `"POST to webhook tokens URL failed"` on create | SparkPost couldn't get a token from your `auth_request_details.url`. Check it's public, returns 200 with `access_token`, and accepts both JSON and form-encoded bodies. |
| Batches keep retrying despite being processed | You returned a non-200. *"If you do not return a 200 for the batch we will continue to resend even if you processed and stored part of the batch."* |
| Every request is 401 in production but works locally | Something in front of your app (proxy, load balancer, serverless platform auth) may be consuming or stripping the `Authorization` header. Log the headers your handler actually receives. |
| Bearer token rejected forever | You returned 403 instead of 401, so SparkPost never refreshed the token. |
| Auth works, then fails after a restart | Demo in-memory token store lost its tokens. Use a real authorization server or a shared store. |
| Duplicate processing | Deduplicate on `X-MessageSystems-Batch-ID` and on each event's `event_id`; return 200 for duplicates. |

### Reproduce a batch locally

```bash
# Basic auth
curl -i -X POST http://localhost:3000/webhooks/sparkpost \
  -u 'basicauthuser:a-long-random-string' \
  -H 'Content-Type: application/json' \
  -H 'X-MessageSystems-Batch-ID: 6f4b3d2a-1e5c-4d7a-9f8b-2c3d4e5f6a7b' \
  -d '[{"msys":{"message_event":{"type":"delivery","event_id":"92356927693813856","message_id":"000443ee14578172be22","timestamp":"1460989507"}}}]'

# The validation batch — must return 200
curl -i -X POST http://localhost:3000/webhooks/sparkpost \
  -u 'basicauthuser:a-long-random-string' \
  -H 'Content-Type: application/json' \
  -d '[{"msys":{}}]'

# OAuth 2.0: fetch a token from the demo endpoint, then use it
TOKEN=$(curl -s -X POST http://localhost:3000/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"CLIENT123","client_secret":"9sdfj791d2bsbf","grant_type":"client_credentials"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -i -X POST http://localhost:3000/webhooks/sparkpost \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '[{"msys":{"track_event":{"type":"click","event_id":"92356927693813856","target_link_url":"http://example.com"}}}]'
```

## Sources

- [Event Webhooks API reference](https://developers.sparkpost.com/api/webhooks/) — `auth_type`, `auth_credentials`, `auth_request_details`, `auth_token`, `custom_headers`, validation batch
- [Event Webhook Authentication and Security](https://github.com/SparkPost/support-docs/blob/main/content/docs/tech-resources/webhook-authentication.md) — Basic Auth, OAuth 2.0, deprecated token method, mTLS, IP allowlisting, FAQ
- [Webhook data streams](https://github.com/SparkPost/support-docs/blob/main/content/docs/tech-resources/webhook-data-streams.md) — retries, batch IDs, the 200 requirement
- [Relay Webhooks API](https://developers.sparkpost.com/api/relay-webhooks/) — `auth_type` is `none` | `oauth2` only
