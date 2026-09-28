---
name: sparkpost-webhooks
description: >
  Receive and authenticate SparkPost event webhooks. Use when setting up SparkPost
  webhook handlers, debugging SparkPost webhook authentication (Basic Auth, OAuth 2.0
  Bearer tokens, or the deprecated X-MessageSystems-Webhook-Token header), parsing the
  batched `msys` payload, or handling email events like delivery, bounce, click, open,
  spam_complaint, delay, and list_unsubscribe. SparkPost event webhooks are NOT signed —
  there is no HMAC and no signature header.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# SparkPost Webhooks

## When to Use This Skill

- How do I receive SparkPost webhooks?
- How do I authenticate SparkPost webhooks? (there is no signature to verify)
- Why is my SparkPost webhook returning 401 / why won't SparkPost create my webhook?
- How do I parse the SparkPost `msys` batch payload?
- How do I handle `delivery`, `bounce`, `click`, `open`, `spam_complaint` events?
- What is `X-MessageSystems-Batch-ID` and how do I deduplicate batches?
- How do I handle SparkPost relay webhooks (inbound email)?

## Critical: SparkPost Event Webhooks Are Not Signed

There is **no HMAC, no signature header, and no signing secret**. Do not look for one —
any code that computes `createHmac` / `hmac.new` for a SparkPost event webhook is wrong.

Authentication is credential-based and **optional**, set by the webhook's `auth_type`
field, whose values are exactly `none` | `basic` | `oauth2`. From SparkPost's
"Event Webhook Authentication and Security" doc: *"The authentication method is set to
'None' by default when creating a new webhook."*

| Mode | `auth_type` | What SparkPost sends |
|------|-------------|----------------------|
| **Basic Auth** (recommended) | `basic` | `Authorization: Basic base64(username:password)` |
| OAuth 2.0 client credentials | `oauth2` | `Authorization: Bearer {token}` |
| Legacy token (deprecated) | — (`auth_token` field) | `X-MessageSystems-Webhook-Token: <token>` |
| None (default) | `none` | nothing |

Your handler must **fail closed**: if no credentials are configured, reject. Never accept
unauthenticated batches silently.

> Not to be confused with **Bird's new platform webhooks** (bird.com). SparkPost is now
> owned by Bird, and the old `www.sparkpost.com/docs/tech-resources/webhook-authentication/`
> URL 301-redirects to Bird's docs — but that is a different product with its own Standard
> Webhooks signing (`webhook-id` / `webhook-timestamp` / `webhook-signature`, `whsec_`
> secrets, `email.delivered`-style event names). None of that applies here.

## Authentication (core)

Basic Auth is the primary path. Parse the header, split on the **first** colon only, and
compare both halves in constant time:

```javascript
const crypto = require('crypto');

// Fixed-length digest compare: safe even when the two strings differ in length.
const eq = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(a, 'utf8').digest(),
  crypto.createHash('sha256').update(b, 'utf8').digest()
);

function verifyBasicAuth(authorizationHeader, username, password) {
  if (!authorizationHeader || username === undefined) return false; // fail closed
  const [scheme, encoded] = authorizationHeader.split(' ');
  if (!encoded || scheme.toLowerCase() !== 'basic') return false;

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  // Malformed base64 decodes to something without a colon — reject.
  const colon = decoded.indexOf(':');
  if (colon === -1) return false;

  // Split on the FIRST colon only: passwords may contain colons.
  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  // `password` is NOT required by SparkPost's API — an empty password is legitimate.
  return eq(user, username) && eq(pass, password ?? '');
}
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

The examples accept **either** a valid Basic header **or** `Authorization: Bearer <token>`
(OAuth 2.0), plus the optional legacy `X-MessageSystems-Webhook-Token`. They also include a
minimal demo `POST /oauth/token` endpoint. See [references/verification.md](references/verification.md).

There is **no SDK verify helper** — the `sparkpost` npm and `sparkpost` PyPI clients manage
webhook configuration but have no receive/authenticate function. Use built-in crypto
(`crypto.timingSafeEqual`, `hmac.compare_digest`) as above.

## Payload: a JSON Array of `msys`-Wrapped Events

SparkPost POSTs a **batch** — a JSON array. Each element has a single `msys` key wrapping
**one event-class object**, which carries the `type` field:

```json
[
  { "msys": { "message_event": { "type": "delivery", "event_id": "92356927693813856", "message_id": "000443ee14578172be22", "timestamp": "1460989507" } } },
  { "msys": { "track_event": { "type": "click", "target_link_url": "http://example.com" } } }
]
```

Read the **single key under `msys`** — do not hardcode `message_event` — then switch on `type`.

| Wrapper key | Event types |
|-------------|-------------|
| `message_event` | `bounce`, `delivery`, `injection`, `spam_complaint`, `out_of_band`, `policy_rejection`, `delay`, `sms_status` |
| `track_event` | `click`, `open`, `initial_open`, `amp_click`, `amp_open`, `amp_initial_open` |
| `gen_event` | `generation_failure`, `generation_rejection` |
| `unsubscribe_event` | `list_unsubscribe`, `link_unsubscribe` |
| `relay_event` | `relay_injection`, `relay_rejection`, `relay_delivery`, `relay_tempfail`, `relay_permfail` |
| `ab_test_event` | `ab_test_completed`, `ab_test_cancelled` |
| `ingest_event` | `success`, `error` |

**Most scalar fields are strings even when numeric**: `"timestamp": "1460989507"` (Unix
**seconds** as a string), `"num_retries": "2"`, `"bounce_class": "1"`, `"subaccount_id": "101"`.
`event_id` format is not consistent across event types (a large integer for some, a UUID for
others) — treat it as an opaque string.

## The Test / Validation Batch

When a webhook is created (and when its target URL changes) SparkPost sends a test POST. *"If
this request does not receive an HTTP 200 response, your request to the Webhook API will fail
with HTTP 400 and the webhook will not be created."* `POST /api/v1/webhooks/{id}/validate`
sends the documented sample batch:

```json
[ { "msys": {} } ]
```

An array whose element has an **empty `msys` object** — no event class at all. Your handler
must accept it and return 200 rather than throwing on the missing event key. There is no
"ping" event type.

## Environment Variables

```bash
# Basic auth (auth_type: "basic") — PRIMARY.
# These are credentials YOUR endpoint defines, NOT your SparkPost login.
SPARKPOST_WEBHOOK_USERNAME="basicauthuser"
SPARKPOST_WEBHOOK_PASSWORD="a-long-random-string"   # may be empty: password is not required

# OAuth 2.0 (auth_type: "oauth2") — optional; used by the demo token endpoint.
SPARKPOST_OAUTH_CLIENT_ID="CLIENT123"
SPARKPOST_OAUTH_CLIENT_SECRET="9sdfj791d2bsbf"

# Legacy X-MessageSystems-Webhook-Token (deprecated; also used by relay webhooks) — optional.
SPARKPOST_WEBHOOK_TOKEN="existing-webhook-token"
```

## Delivery, Retries, and Idempotency

- **Respond 200.** The create/validate test explicitly requires 200, and any non-2xx is retried.
- **Timeout: 10 seconds** per batch posting attempt.
- **Retries** increase logarithmically and stop after **8 hours** — *"12 total attempts will be
  made to POST the webhook batch (the initial attempt + 11 retries)"*.
- **Batch size** *"may vary from 1 to 350 or more events"*, and a batch can mix event types.
- Webhooks only POST to **ports 80 and 443**. Events begin flowing **~1 minute** after creation.
- Store the raw batch, respond 200, then process asynchronously: *"if you do not return a 200
  for the batch we will continue to resend even if you processed and stored part of the batch"*.
- **Deduplicate on `X-MessageSystems-Batch-ID`** (*"useful for detecting and prevention of
  processing duplicate batches"*) and on each event's unique `event_id`. Look the header up
  **case-insensitively** — SparkPost's support docs spell it `X-Messagesystems-Batch-Id`. A
  duplicate batch should still return 200.

## Network Security

HTTPS is recommended. **mTLS** *"is in route to deprecation on all regions at May 18th, 2026"* —
treat it as going away and don't build on it. For IP allowlisting SparkPost maintains the
hostname `wh.egress.sparkpost.com`, *"which lists the egress IPs under the host's A record"*;
non-Enterprise customers should allowlist that hostname rather than individual IPs. **Never
hardcode an IP list.** `custom_headers` (e.g. `{"x-api-key": "abcd"}`) is sent on every batch
POST and SparkPost suggests it as an additional measure — optional, not a substitute for auth.

## Relay Webhooks (Inbound Email) Are a Separate API

`/api/v1/relay-webhooks` delivers **inbound email content** as `msys.relay_message`, and its
`auth_type` enum is only `none` | `oauth2` (**no Basic Auth**), plus `auth_token` →
`X-MessageSystems-Webhook-Token`. Do not confuse `relay_message` (inbound email, relay
webhooks) with `relay_event` (`relay_injection` / `relay_delivery` / … status events delivered
via **event** webhooks). See [references/overview.md](references/overview.md).

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 sparkpost --path /webhooks/sparkpost
```

No account required — the CLI creates a guest account on first run and provides a local tunnel
plus a web UI for inspecting requests. Note that SparkPost only accepts targets on ports 80/443,
so a tunnel (or Hookdeck) is required for local development.

> **Using Hookdeck in front of SparkPost:** Hookdeck's `SPARKPOST` source supports **Basic
> Auth** only (no OAuth 2.0 token-URL flow). Configure Basic Auth on the SparkPost webhook and
> the same credentials on the Hookdeck source.

## Resources

- [overview.md](references/overview.md) - Event classes, all event types, payload fields, relay webhooks
- [setup.md](references/setup.md) - Create and configure the webhook (app + API), pick an auth mode
- [verification.md](references/verification.md) - Basic Auth, OAuth 2.0, legacy token, gotchas, debugging
- [examples/express/](examples/express/) - Express handler with tests
- [examples/nextjs/](examples/nextjs/) - Next.js App Router handler with tests
- [examples/fastapi/](examples/fastapi/) - FastAPI handler with tests

## Recommended: webhook-handler-patterns

For production-ready webhook handling, also install the webhook-handler-patterns skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) - Webhook processing flow
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) - Prevent duplicate processing (batch IDs and `event_id`)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) - Graceful error recovery
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) - Handle transient failures

## Related Skills

- [sendgrid-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sendgrid-webhooks) - SendGrid email event webhooks with ECDSA verification
- [mailgun-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mailgun-webhooks) - Mailgun email event webhooks with HMAC-SHA256
- [postmark-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/postmark-webhooks) - Postmark email webhooks (Basic Auth / token, no signature)
- [resend-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/resend-webhooks) - Resend email webhooks with Svix signatures
- [mailchimp-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mailchimp-webhooks) - Mailchimp list and campaign webhooks
- [twilio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/twilio-webhooks) - Twilio messaging webhooks with signature verification
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
