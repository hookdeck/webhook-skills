# Setting Up Digital Samba Webhooks

## Prerequisites

- A Digital Samba account with a REST API developer key
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 digital-samba --path /webhooks/digital-samba` locally)

## Choose Your Secret

Webhooks are created and edited through the Digital Samba REST API, not a dashboard. The secret is a value you choose and send as the `authorization_header` property.

Set authorization_header on the webhook through the Digital Samba REST API, then paste the same secret.

1. Generate a long random string, for example `openssl rand -hex 32`.
2. Store it as `DIGITAL_SAMBA_WEBHOOK_SECRET`. Store just the secret, not `Bearer <secret>`; Digital Samba adds the `Bearer` scheme when it sends the request.

`authorization_header` is optional, but highly recommended. Without it, requests carry nothing to authenticate.

## Register Your Endpoint

Call `POST /webhooks` on the REST API with your endpoint, the events to receive and the secret:

```bash
curl -X POST https://api.digitalsamba.com/api/v1/webhooks \
  -H "Authorization: Bearer $DIGITAL_SAMBA_DEVELOPER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://example.com/webhooks/digital-samba",
    "authorization_header": "'"$DIGITAL_SAMBA_WEBHOOK_SECRET"'",
    "events": ["participant_joined", "participant_left", "session_started", "session_ended", "recording_ready"]
  }'
```

Check the [create webhook reference](https://docs.digitalsamba.com/reference/rest-api/webhooks/create) for the exact request fields. To add or change the secret later, edit the webhook through the API.

## Test

Replay a request with curl:

```bash
curl -X POST http://localhost:3000/webhooks/digital-samba \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITAL_SAMBA_WEBHOOK_SECRET" \
  -d '{"eventType":"participant_joined","sessionId":"4fcc375c-e0ce-4f52-9b35-3a034042ab5a","roomId":"7f8c8eac-6643-47db-8d93-e7633e6e53ec","timestamp":1675790387,"data":{"participantId":"8b085f23-9a2a-465d-bdbb-73a233c7df90","name":"John Smith","role":"moderator"}}'
```

## Network Notes

Digital Samba doesn't publish source IPs, so an IP allowlist is not an option. Use the bearer secret and HTTPS.
