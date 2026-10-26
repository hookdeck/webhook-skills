# Setting Up parcelLab Webhooks

## Prerequisites

- A parcelLab account (API v2) and your parcelLab contact or support channel
- A public HTTPS endpoint for your receiver (plain HTTP is not supported). Use the Hookdeck CLI locally.

## How Webhooks Are Configured

parcelLab's docs describe no self-service webhook screen. You provide parcelLab with the
HTTPS webhook URL and the credentials, and parcelLab sets it up. Supported authentication:
HTTP Basic, access token headers and OAuth 2.0 access token. Choose **HTTP Basic**.

1. Generate a username and a long random password.
2. Give parcelLab your HTTPS URL (for example `https://example.com/webhooks/parcellab`) and the
   Basic credentials.
3. Store them as `PARCELLAB_WEBHOOK_USERNAME` and `PARCELLAB_WEBHOOK_PASSWORD`.
4. Ask whether you want the native JSON format or the CloudEvents format.
5. If you use a firewall allowlist, permit `35.156.240.70`, `35.157.215.87` and `35.157.195.174`.

## Credentials Must Arrive on the First Request

The docs don't say whether parcelLab sends Basic credentials preemptively. Don't build the
endpoint around a `401` + `WWW-Authenticate` challenge: it won't work with parcelLab, and it
won't work through Hookdeck, which verifies the request as received.

## Local Testing

```bash
npx hookdeck-cli listen 3000 parcellab --path /webhooks/parcellab
```

Use the printed URL as the endpoint (for FastAPI use port `8000`). Send a manual test:

```bash
curl -X POST http://localhost:3000/webhooks/parcellab \
  -u "$PARCELLAB_WEBHOOK_USERNAME:$PARCELLAB_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"onDelivered","eventid":"abc123-def456","references":{"tracking_number":"00340000000001"}}'
```

## Rotating the Credential

Basic credentials are static, so rotate them if they leak: agree the new values with
parcelLab, then update the environment variables at the time parcelLab switches over.
