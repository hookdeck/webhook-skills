# Grafana Webhooks - FastAPI Example

Receives notifications from a **Grafana Alerting webhook contact point** and verifies
the optional HMAC-SHA256 signature.

Not for Grafana legacy dashboard alerting (removed in Grafana 11), Grafana OnCall/IRM
outgoing webhooks, or Prometheus Alertmanager — see the skill's
[references/overview.md](../../references/overview.md).

## Prerequisites

- Python 3.9+
- Grafana 11.6+ (self-hosted or Grafana Cloud) — the HMAC Signature subform was added
  in 11.6. Earlier versions can send the webhook but cannot sign it.
- A webhook contact point with an HMAC **Secret** configured

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your contact point's HMAC **Secret** in `GRAFANA_WEBHOOK_SECRET`.

   If you customised the contact point's **Header** field, set
   `GRAFANA_SIGNATURE_HEADER` to match. If you set a **Timestamp Header**, set
   `GRAFANA_TIMESTAMP_HEADER` to exactly the same name — that switches this example
   from signing the body alone to signing `timestamp + ":" + body`, and enables the
   replay check.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 grafana --path /webhooks/grafana
```

Paste the URL the CLI prints into the contact point's **URL** field in Grafana, then
click **Test** on the contact point. Grafana sends a normal, signed notification with
a synthetic alert (`alertname: TestAlert`, `instance: Grafana`) — there is no separate
handshake or challenge request.

## Endpoints

- `POST /webhooks/grafana` — receives and verifies Grafana alert notifications
- `GET /health` — health check

## Why manual verification

Grafana publishes **no receiver SDK** for webhook signature verification in any
language, so this example implements the algorithm directly — the same HMAC-SHA256
hex scheme the Express and Next.js examples in this skill use.

## What the handler does

1. Reads the raw bytes with `await request.body()` — Grafana signs the exact bytes it
   sends, and with the **Custom Payload** option those bytes may be pretty-printed or
   not JSON at all, so re-serializing parsed JSON would break verification. Don't use
   a Pydantic body model on this route; FastAPI would parse before you could verify.
2. Verifies HMAC-SHA256 as a bare lowercase hex digest with `hmac.compare_digest`
   (constant-time, and safe on differing lengths).
3. Parses the JSON only after verification.
4. Dispatches on `status` (`firing` / `resolved`) — Grafana sends **no event-type
   header and no delivery id** — then iterates `alerts[]`, because a `firing` group
   can contain individual `resolved` alerts.
5. Returns `200`. Grafana treats any 2xx as success.

Status codes: `200` accepted, `400` missing/invalid signature or unparseable body,
`500` no secret configured (fails closed).
