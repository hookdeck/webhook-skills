# Setting Up iSnap Webhooks

## Prerequisites

- An iSnap account and an API key (`isnap_live_...`). Trial keys can't call webhook operations
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

iSnap has no webhook dashboard form: subscriptions are managed through the API.

## How Do I Create a Subscription?

```bash
curl -sS -X POST https://api.isnap.ai/v1/webhooks \
  -H "Authorization: Bearer $ISNAP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://hooks.your-domain.example/isnap",
    "events": ["message.*", "line.*"]
  }'
```

| Field | Required | Value |
|-------|----------|-------|
| `url` | Yes | Absolute `https://` URL on a public host (loopback, private and reserved addresses are refused, and the host is re-checked before every attempt) |
| `events` | Yes | At least one entry: an exact type (`message.received`), a family wildcard (`line.*`) or `*`. There is no default filter |
| `line_ids` | No | Line ids to receive events for. Absent or `[]` means all lines |

The call returns `201` and the subscription is active immediately. `description` and `active` are ignored on create; set them with `PATCH /v1/webhooks/{id}`. `POST /v1/webhooks` does **not** honor `Idempotency-Key`, so a repeated request creates a second subscription and every event is delivered twice: after a lost response, `GET /v1/webhooks` before you create again. Subscribing to `webhook.test` or `webhook.*` has no effect.

A delivery doesn't carry the `wh_` id of its subscription, so give each subscription its own URL (for example a path segment of your own). Otherwise your receiver has to try each signing secret, which the examples support through a comma-separated `ISNAP_WEBHOOK_SECRET`.

## Where Is My Signing Secret?

The `secret` field of the `POST /v1/webhooks` response: `whsec_` plus 64 base64 characters (48 bytes of key). It is returned once and no other call returns it, so run the command where its output isn't logged. Store the full value, prefix included, in `ISNAP_WEBHOOK_SECRET`. Keep it out of client-side code and version control. Each subscription has its own secret.

## How Do I Rotate the Signing Secret?

`POST /v1/webhooks/{id}/rotate-secret` returns `id`, `secret` and `old_secret_expires_at`. The rotation takes effect immediately: every later request (first attempts, retries of older deliveries, replays and probes) is signed with the new secret only, and iSnap never signs with the previous one. `old_secret_expires_at` (rotation time plus 5 minutes) is informational. To avoid refused deliveries:

1. Make your receiver accept a list of secrets (the examples accept a comma-separated `ISNAP_WEBHOOK_SECRET`).
2. Rotate once. Don't retry blindly: a second call replaces the secret again.
3. Add the new secret to the list immediately. Until you do, answer unverifiable requests with a non-`2xx` (not `410`) and iSnap retries.
4. Remove the previous secret after `old_secret_expires_at`.

## How Do I Test an Endpoint?

Send a real event (for example a message to one of your lines). iSnap also sends a signed `webhook.test` probe, with `X-iSnap-Probe: 1`, to a **suspended** subscription: it is a normal signed delivery, not a challenge to echo, and a `2xx` response resumes the subscription. The first probe comes within 15 minutes of the suspension, and probes are at least 15 minutes apart.

**Local tunnel without an account:**

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 isnap --path /webhooks/isnap
```

Use the printed URL as the subscription `url`. Check the handler against the documented test vector in [verification.md](verification.md).

## What Does My Endpoint Have to Do?

- Serve HTTPS with a certificate a standard client accepts.
- Verify the signature on the raw body.
- Return `2xx` within 10 seconds, with an empty body. The first 1,024 characters of your response are stored in the delivery record.
- Don't redirect: a `3xx` is a failed attempt.
- Return `2xx` for event types you don't handle and for probes.
- Never return `410`, unless you want the subscription turned off. It sets `active: false` immediately and events while inactive are lost. Turn it back on with `PATCH /v1/webhooks/{id}` and `active: true`.

## Retries, Suspension and Replays

Any non-`2xx` (including `429`; `Retry-After` is ignored), timeout or network error is retried, up to 7 attempts per schedule: 30 s, 1 min, 5 min, 30 min, 2 h and 12 h after the previous attempt, about 14 hours 36 minutes in all. Every attempt keeps the same `webhook-id` and gets a new `webhook-timestamp` and signature. After 10 consecutive deliveries use all their attempts, the subscription is suspended until a probe succeeds; deliveries waiting at that point are resent with a full new schedule (unless older than 24 hours), but events that occurred during the suspension are not recorded. Detect a suspension by a `webhook.test` request reaching you, by `failure_count` of 10 or more in `GET /v1/webhooks`, or by deliveries stuck `pending` with `next_retry_at: null`. Failed deliveries can be replayed while their record exists.

## Test Keys

An `isnap_test_` key is not a separate environment: it acts on the same account, lines and subscriptions as an `isnap_live_` key.

## IP Allowlists

iSnap promises no `User-Agent` and no list of source addresses. A delivery is authenticated by its signature alone: always verify `webhook-signature`.
