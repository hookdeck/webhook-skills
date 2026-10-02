# Sentry Webhooks - Express Example

Minimal example of receiving Sentry **Integration Platform** webhooks with
signature verification: HMAC-SHA256 over the raw body, lowercase hex, in
`Sentry-Hook-Signature` (or `Sentry-App-Signature`).

## Prerequisites

- Node.js 18+
- A Sentry **internal** or **public integration** (Settings → Developer
  Settings) with a **Webhook URL** and at least one resource ticked, and its
  **Client Secret**

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Add your integration's **Client Secret** to `.env` as
   `SENTRY_CLIENT_SECRET`.

   It is used **as-is** as a raw UTF-8 HMAC key — do not decode it. It is
   **not** the Client ID, not an auth token (`sntrys_…`), and not a DSN.

   Optionally set `SENTRY_WEBHOOK_TOLERANCE_SECONDS` (e.g. `300`) to enable the
   timestamp replay dampener. Leave it empty and the check is skipped — see
   below for why it is opt-in.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/sentry`.

## Test

```bash
npm test
```

The tests generate real signatures with the same algorithm Sentry uses —
HMAC-SHA256 of the raw body, hex — and cover tampering, wrong secrets, the
missing header, the `Sentry-App-Signature` fallback, base64 digests,
`sha256=` prefixes, Stripe-style `timestamp.body` signing, hex-decoded secrets,
garbage short signatures (the length guard), empty bodies, `"{}"` vs `""`,
non-ASCII payloads, the `issue.archived` alias, the undocumented
`metric_alert.open`, a `FAILED` `preprod_artifact.size_analysis_completed`, and
fail-closed behaviour when the secret is unset.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 sentry --path /webhooks/sentry
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI for inspecting each request (raw body,
`Sentry-Hook-Resource` and `Sentry-Hook-Signature` included, which is exactly
what you want when debugging). Paste the printed URL into your integration's
**Webhook URL**, then resolve or comment on an issue in Sentry to get a real,
signed delivery.

Sentry sends **no handshake, challenge or validation request** — every delivery
is an ordinary signed event. (For a public integration the first one is
`installation.created`.)

## What this example demonstrates

- **The event name is `Sentry-Hook-Resource` + `.` + `body.action`.** Sentry's
  body has **no `type` and no `event` field**, only `action`. `eventToken()`
  reconstructs `issue.created` from the header plus the body, and the handler
  switches on that. A handler keyed on a body field alone never fires.
- **`express.raw({ type: '*/*' })` on the webhook route** — Sentry signs the
  exact bytes it sent. Mounting `express.json()` ahead of this route destroys
  the raw body *and* turns Sentry's legitimate **empty body** into `{}`, so
  `"{}"` gets signed instead of `""` and verification fails every time.
- **Raw-body verification, not Sentry's published snippet.** The documented
  `JSON.stringify(request.body)` approach re-serializes a parsed body and only
  matches for ASCII-only payloads — Sentry emits `\uXXXX` escapes
  (`ensure_ascii=True`) where `JSON.stringify` emits literal UTF-8. One accent
  or emoji in an issue title and the snippet rejects a valid delivery. There is
  a test for exactly this.
- **Both signature headers.** `Sentry-Hook-Signature` on subscribed webhooks,
  `Sentry-App-Signature` on UI-component external requests
  (`select_options.requested`, `external_issue.*`,
  `alert_rule_action.requested`) — same digest, different name. Sentry's own
  reference app checks both.
- **Length guard before `crypto.timingSafeEqual`** — it throws on mismatched
  lengths, and an uncaught throw becomes a 500. Sentry does not retry 500s;
  repeated failures trip a circuit breaker that can **disable** your webhook.
- **Fail closed** — an unset `SENTRY_CLIENT_SECRET` returns 500 (your server is
  misconfigured), a bad signature returns 401 (the request is wrong).
  Verification is never silently skipped.
- **The timestamp check is opt-in, and labelled as a dampener.**
  `Sentry-Hook-Timestamp` (UNIX **seconds**) is **not part of the signed
  string**, so it is not cryptographically bound — an attacker replaying a
  captured body + signature forges it freely. Real replay protection is
  deduplication on the **`Request-ID`** header, which is also your idempotency
  key because the body has no delivery id.
- **Acknowledge fast, work async** — a 200 goes out inside Sentry's
  **1-second** budget and `handleEvent` runs afterwards.
- **`actor.id` is `string | number`** — when Sentry itself acts it sends
  `{"type": "application", "id": "sentry", "name": "Sentry"}`.
- **Resource-name traps handled** — `event_alert` (not `issue_alert`) is the
  issue-alert resource; `issue.ignored` and `issue.archived` are both handled;
  `metric_alert.open` is handled though undocumented.
- **`data.event.tags` is an array of `[key, value]` pairs**, not an object.
- **`preprod_artifact.*` uses camelCase keys**, and a `*_completed` action can
  still mean failure — the handler branches on `state`, not on the action name.

## Notes

- **No SDK does this.** `@sentry/*` are error-reporting SDKs and ship no
  webhook-signature verification helper, so verification here is a manual HMAC
  with `node:crypto`. Don't add `@sentry/node` for this.
- **Sentry does not retry.** A dropped delivery is lost — backfill via Sentry's
  API rather than waiting for a redelivery. Past deliveries and their status
  codes are visible under the integration's Dashboard.
- For the signature scheme in detail, the empty-body case and the other Sentry
  webhook surfaces (service hooks, the unsigned legacy WebHooks plugin), see
  [../../references/verification.md](../../references/verification.md).
