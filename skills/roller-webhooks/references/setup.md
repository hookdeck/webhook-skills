# Setting Up ROLLER Webhooks

## Prerequisites

- A ROLLER account with API access
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 roller --path /webhooks/roller` locally)

## Choose Your API Key

ROLLER echoes back whatever `authentication.apiKey` you give it, and the docs' example is just a
label (like `CRM Trigger Webhook 002`). Do not use a label.

> Set the webhook's apiKey to a long random value, then paste the same value here.

Generate one, for example:

```bash
openssl rand -hex 32
```

Store it as `ROLLER_WEBHOOK_API_KEY` (or paste it into the ROLLER source in Hookdeck).

## Register Your Endpoint

Webhooks are registered through the REST API ([create webhook](https://docs.roller.app/docs/api/rest/operations/create-webhook)).
POST to the webhooks endpoint with your endpoint URL, the events you want, and the key:

```json
{
  "url": "https://example.com/webhooks/roller",
  "authentication": { "apiKey": "<your long random value>" }
}
```

Check the create-webhook reference for the exact path and the other required fields (such as
the event selection). Subsequent webhook payloads include an HTTP header `x-roller-apikey` with
this value.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/roller \
  -H "Content-Type: application/json" \
  -H "x-roller-apikey: $ROLLER_WEBHOOK_API_KEY" \
  -d '{"type":"Booking","eventType":"Created"}'
```

## Rotating the Key

Register the webhook again with a new `apiKey` and update `ROLLER_WEBHOOK_API_KEY`.
