# Setting Up Oyster Webhooks

## Prerequisites

- An Oyster Developer Application (partners and customers each have a guide; an existing
  application works)
- An Access Token authorized for the same company that owns the Developer Application
  (with the `subscribe` scope for the webhook endpoints)
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

Webhooks are configured through the API; the docs describe no dashboard screen for them.

## Choose Your Shared Secret

Pick a random value, for example `openssl rand -hex 32`. Oyster will send it back as an
`Authorization` bearer header, so the value you store in `OYSTER_AUTHORIZATION` is
`Bearer ` plus that secret (for `12345` the header is `Bearer 12345`).

## Register Your Endpoint

```bash
curl --request POST \
     --url https://api.oysterhr.com/v1/webhooks \
     --header 'accept: application/json' \
     --header 'authorization: Bearer <ACCESS TOKEN>' \
     --header 'content-type: application/json' \
     --data '{"url": "https://example.com/webhooks/oyster", "sharedSecret": "<YOUR SHARED SECRET>"}'
```

The response returns the ID of the new endpoint. Keep it: you need it to update or delete the
endpoint (`PATCH` / `DELETE /v1/webhooks/{id}`), for example to rotate the shared secret.
`GET /v1/webhooks` lists your endpoints.

Then set:

```bash
OYSTER_AUTHORIZATION=Bearer <YOUR SHARED SECRET>
```

## Local Testing

```bash
npx hookdeck-cli listen 3000 oyster --path /webhooks/oyster
```

Register the printed URL as the endpoint `url`. For FastAPI, use port `8000`.

## Send a Test Payload

Oyster can send a test payload to a registered endpoint:

```bash
curl --request POST \
     --url https://api.oysterhr.com/v1/webhooks/<ENDPOINT ID>/test \
     --header 'authorization: Bearer <ACCESS TOKEN>'
```

You can also simulate a delivery yourself:

```bash
curl -X POST http://localhost:3000/webhooks/oyster \
  -H "Content-Type: application/json" \
  -H "Authorization: $OYSTER_AUTHORIZATION" \
  -d '{"eventName":"expenses.expense_approved","eventTimestamp":"2026-04-21T09:35:13Z","id":"wh_01J19XRFZ2Q4QBDC6CA461AGT7","companyId":"ABC1234","data":{"expenseId":"exp_1"}}'
```

## Sandbox

Oyster has a Developer Sandbox. Register a separate endpoint and shared secret for it, and
keep a separate `OYSTER_AUTHORIZATION` per environment.
