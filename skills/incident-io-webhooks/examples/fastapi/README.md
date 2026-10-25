# incident.io Webhooks - FastAPI Example

Minimal example of receiving incident.io webhooks (Settings → Webhooks) with signature verification.
incident.io signs with Standard Webhooks (Svix): `webhook-id`, `webhook-timestamp` and
`webhook-signature` headers, HMAC-SHA256 over `{id}.{timestamp}.{raw body}`, base64 digest.

The verifier is written out by hand (no SDK) so the timestamp window is configurable and both secret
forms work: `whsec_<base64>` is base64-decoded, anything else is used as UTF-8 bytes.

## Prerequisites

- Python 3.9+
- An incident.io webhook endpoint and its **Signing secret**

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's Signing secret to `.env` as `INCIDENT_IO_WEBHOOK_SECRET`. Optionally set
   `INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS` to enforce a replay window (unset = no window).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/incident-io
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same algorithm incident.io uses, and cover secret rotation (several
`v1,` entries), both secret forms, tampering, malformed timestamps, the optional window, and the
id-only private payloads.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 incident-io --path /webhooks/incident-io
```

1. In incident.io go to **Settings → Webhooks**, add an endpoint with the tunnel URL and pick events.
2. Copy the endpoint's **Signing secret** into `.env` and restart.
3. Trigger a subscribed event, for example by declaring a test incident.

## How the Handler Reads Events

The body is `{"event_type": "<type>", "<type>": {...resource}}`. The handler routes on
`body["event_type"]` and reads the resource with `body[body["event_type"]]`. Private incidents, alerts
and escalations only include `{"id": "..."}`; fetch the details from the incident.io API with a key
that has private access. The handler returns `200 {"received": true, "eventType": ...}` for every
verified event, including unknown types.
