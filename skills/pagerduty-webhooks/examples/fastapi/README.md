# PagerDuty Webhooks - FastAPI Example

Minimal example of receiving **PagerDuty V3 webhooks** with
`X-PagerDuty-Signature` verification (HMAC-SHA256 over the raw body, lowercase
hex), including the **multiple comma-separated signatures** PagerDuty sends
during a secret rotation.

## Prerequisites

- Python 3.9+
- A PagerDuty webhook subscription and its **signing secret**
  (`delivery_method.secret` from the
  `POST https://api.pagerduty.com/webhook_subscriptions` response)

## Setup

1. Create a virtual environment and install dependencies:

   ```bash
   python3 -m venv venv
   source venv/bin/activate     # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Add your PagerDuty webhook **signing secret** to `.env` as
   `PAGERDUTY_WEBHOOK_SECRET`.

   PagerDuty generates it when the subscription is **created** and returns it
   once, as `delivery_method.secret`. It is used **as-is** as a UTF-8 HMAC key
   — do not decode it. It is **not** an API key / REST token, and **not** an
   Events API routing key.

## Run

```bash
python main.py
# or: uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/pagerduty`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real `X-PagerDuty-Signature` values with the same algorithm
PagerDuty uses — HMAC-SHA256 of the raw body, lowercase hex, `v1=` prefixed —
and cover: tampering, a wrong secret, a missing header, a header with no `v1=`
entry, truncated and non-hex digests, base64 digests, uppercase hex,
re-serialized bodies, unicode payloads, **multi-signature rotation (including
when only the second signature matches)**, an unknown future `v2=` version,
fail-closed behaviour when the secret is unset, and PagerDuty's own documented
`incident.priority_updated` and `service.updated` payloads.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 pagerduty --path /webhooks/pagerduty
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI for inspecting each request (raw body and
`X-PagerDuty-Signature` header included, which is what you want when debugging).

Use the printed URL as `delivery_method.url` when creating the subscription,
then fire a test delivery:

```bash
curl -X POST https://api.pagerduty.com/webhook_subscriptions/PWHSUB1/ping \
  -H 'Authorization: Token token=YOUR_API_TOKEN'
```

That returns `202` and delivers a **`pagey.ping` event** — enough to prove the
endpoint is reachable. PagerDuty does not document whether the ping carries
`X-PagerDuty-Signature`, so check your logs before reading a ping as proof that
verification works. `pagey.ping` is not
in the Event Types table and is not something you subscribe to, so it lands in
this example's **default branch** with a `resource_type` and `data` you have not
seen before; that is expected, not a bug.

For real traffic, trigger an incident on the filtered service and
acknowledge/resolve it to exercise `incident.acknowledged` and
`incident.resolved`.

**PagerDuty sends no handshake, challenge or validation request** — the only
unsolicited delivery you can trigger is an explicit `pagey.ping` test via the
ping endpoint. Every delivery is an ordinary signed event.

## What this example demonstrates

- **`await request.body()` before anything else** — PagerDuty signs the exact
  bytes it sent. PagerDuty: *"Verifying PagerDuty webhook signatures requires
  the unaltered raw body of the request sent to you."* Do not declare a Pydantic
  model or call `await request.json()` before verifying: a parsed object cannot
  be re-serialized byte for byte, and the digest will not match.
- **`hmac.compare_digest` on BYTES** — it is constant-time and, unlike Node's
  `crypto.timingSafeEqual`, tolerates unequal lengths without raising. But given
  two `str` arguments it raises `TypeError` on any character above U+007F, and
  Starlette decodes headers as latin-1 — so a forged signature byte would turn a
  403 into an unhandled 500. Encode both sides first.
- **Accept a match against ANY `v1=` entry** — the header can carry several
  signatures during a zero-downtime secret rotation. A verifier that compares
  the whole header string works until the day someone rotates the secret.
- **Ignore unknown signature versions** rather than failing, so a future `v2=`
  can roll out without breaking this receiver.
- **Verify, then parse.** `json.loads` only runs after the signature checks out,
  and decodes as UTF-8 explicitly — PagerDuty payloads support unicode.
- **Status codes chosen for PagerDuty's retry rules.** Any 4xx except 429 is
  permanent (no retry): **400** for a missing/malformed header, an empty body or
  unparseable JSON; **403** for a signature mismatch (mirroring PagerDuty's Go
  client). **500** only for an unset secret — *your* misconfiguration, where a
  retry is what you want.
- **Fail closed** — with `PAGERDUTY_WEBHOOK_SECRET` unset, every delivery is
  rejected. Verification is never silently skipped.
- **No timestamp check.** Nothing in the signed content carries a timestamp or
  nonce, so there is no replay window to enforce. Replay protection is
  de-duplication on the `X-Webhook-Id` header (unique per webhook, repeated
  across delivery attempts) — retain ids for 48+ hours.
- **`BackgroundTasks` for `202 Accepted`, then async work** — PagerDuty's own
  recommendation, inside its 5-second budget (16 seconds for webhooks generated
  from Custom Incident Actions). For real workloads, push to a proper queue:
  `BackgroundTasks` runs in the same process and dies with it.
- **`event.agent` and `event.client` can be `None`** — `describe_agent()` guards
  for it. PagerDuty's documented `service.updated` example has both as `null`.
- **A default branch for unknown `event_type` values** — PagerDuty adds event
  types over time, ships unannounced Early Access events, and sends
  `pagey.ping` on test.

## Notes

- Neither `pdpyras` (Python) nor `@pagerduty/pdjs` (JavaScript) ships a
  webhook-verification helper — they are REST API clients. The only official
  verifier is in the Go client,
  [`webhookv3/webhookv3.go`](https://github.com/PagerDuty/go-pagerduty/blob/master/webhookv3/webhookv3.go),
  which this example mirrors. Nothing extra to install: `hmac` + `hashlib` are
  in the standard library.
- **`incident.service_updated`** (underscore) is the incident's service
  changing; **`service.updated`** is the service object changing. Two different
  events, both handled here.
- **Ordering is guaranteed per subscription + incident**, but while a webhook is
  being retried, subsequent webhooks for that same subscription and resource id
  are **queued** — so a slow handler stalls its own stream.
- After **3 consecutive dropped** webhooks PagerDuty disables the subscription
  for **24 hours**. Returning 5xx for a bad signature is how you get there.
- PagerDuty guarantees delivery up to **55 KB**, is best-effort to **256 KB**,
  and drops anything larger. If you put a body-size cap in front of this app,
  make it **at least 256 KB**.
- For the signature scheme in detail, mutual TLS config, OAuth and IP safelists,
  see [../../references/verification.md](../../references/verification.md).
