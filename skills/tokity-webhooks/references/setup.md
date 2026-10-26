# Setting Up Tokity Webhooks

## Prerequisites

- A Tokity (DeskDirector) site with access to the Admin Portal
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Create a Webhook

1. Open the Admin Portal and go to **Advanced > Webhook**. A slider next to the "Webhook"
   header enables or disables webhooks for the site.
2. Choose **Create Webhook > Add ticket/chat/custom webhook**.
3. Enter a **Description** and the **Receiver URL**, for example
   `https://example.com/webhooks/tokity`.
4. Select the events to listen for: ticket change types, or chat sessions.
5. Test it by doing something that triggers the event (comment on a ticket, start a chat).

## Get the Secret

Each webhook registration gets its own auto-generated secret. On the **Registered Webhooks** tab,
click **Display detail** to show the full receiver URL and the secret. You can also delete a
webhook or **regenerate** its secret there; update `TOKITY_WEBHOOK_SECRET` when you do.

Use the secret exactly as shown. Tokity signs with its UTF-8 bytes, so do not hex- or
base64-decode it.

## Events Instead of Webhooks

Events (a trigger, conditions and actions) are recommended where available. Each event has its own
secret and each action is configured like a webhook endpoint; the payload is signed the same way
and has no `from` property. Events are capped at 100 per tenant.

## Webhook Tabs

- **Registered Webhooks**: active webhooks, receiver URLs and secrets.
- **Deleted Webhooks**: recently removed webhooks.
- **Webhook Security**: how signing works.
- **Payload Sample**: the JSON schema and a sample payload, useful for Zapier or Power Automate.

## Local Testing

```bash
npx hookdeck-cli listen 3000 tokity --path /webhooks/tokity
```

Use the printed URL as the Receiver URL. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
BODY='[{"id":22282,"status":"New","from":null}]'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TOKITY_WEBHOOK_SECRET" -binary | base64)
curl -X POST http://localhost:3000/webhooks/tokity \
  -H "Content-Type: application/json" \
  -H "x-dd-signature: sha256=$SIG" \
  -d "$BODY"
```

## Notes

- Retries, the delivery timeout and success codes are not documented by Tokity. Respond with
  `200` quickly.
- With Hookdeck in front of your app, the Tokity source verifies the signature using the same
  secret before delivering to your endpoint.
