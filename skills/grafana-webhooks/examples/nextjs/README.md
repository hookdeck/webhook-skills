# Grafana Webhooks - Next.js Example

Receives notifications from a **Grafana Alerting webhook contact point** in a Next.js
App Router route handler, and verifies the optional HMAC-SHA256 signature.

Not for Grafana legacy dashboard alerting (removed in Grafana 11), Grafana OnCall/IRM
outgoing webhooks, or Prometheus Alertmanager — see the skill's
[references/overview.md](../../references/overview.md).

## Prerequisites

- Node.js 18+
- Grafana 11.6+ (self-hosted or Grafana Cloud) — the HMAC Signature subform was added
  in 11.6. Earlier versions can send the webhook but cannot sign it.
- A webhook contact point with an HMAC **Secret** configured

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your contact point's HMAC **Secret** in `GRAFANA_WEBHOOK_SECRET`.

   If you customised the contact point's **Header** field, set
   `GRAFANA_SIGNATURE_HEADER` to match. If you set a **Timestamp Header**, set
   `GRAFANA_TIMESTAMP_HEADER` to exactly the same name — that switches this example
   from signing the body alone to signing `timestamp + ":" + body`, and enables the
   replay check.

## Run

```bash
npm run dev
```

The route is served at http://localhost:3000/webhooks/grafana

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 grafana --path /webhooks/grafana
```

Paste the URL the CLI prints into the contact point's **URL** field in Grafana, then
click **Test** on the contact point. Grafana sends a normal, signed notification with
a synthetic alert (`alertname: TestAlert`, `instance: Grafana`) — there is no separate
handshake or challenge request.

## Route

- `POST /webhooks/grafana` — `app/webhooks/grafana/route.ts`

## What the handler does

1. Reads the raw body with `await request.text()` **before** parsing. Grafana signs
   the exact bytes it sends, and with the **Custom Payload** option those bytes may be
   pretty-printed or not JSON at all, so re-serializing parsed JSON would break
   verification. Never use `await request.json()` before verifying.
2. Verifies HMAC-SHA256 as a bare lowercase hex digest, timing-safely.
3. Parses the JSON only after verification.
4. Dispatches on `status` (`firing` / `resolved`) — Grafana sends **no event-type
   header and no delivery id** — then iterates `alerts[]`, because a `firing` group
   can contain individual `resolved` alerts.
5. Returns `200`. Grafana treats any 2xx as success.

The route sets `export const dynamic = 'force-dynamic'` so nothing is cached, and
reads the header names per request via `getConfig()` rather than hard-coding them —
both names are configurable on the contact point, and the timestamp header has no
default name at all.

Status codes: `200` accepted, `400` missing/invalid signature or unparseable body,
`500` no secret configured (fails closed).
