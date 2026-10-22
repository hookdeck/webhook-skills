# Setting Up Stedi Webhooks

## Prerequisites

- A Stedi account (production or test mode) and an API key
- A public HTTPS URL for your receiver (use `npx hookdeck-cli listen 3000 stedi --path /webhooks/stedi` while developing). Stedi doesn't follow redirects.

## Create an Event Destination

### Portal

1. Open **Event destinations** in your [developer settings](https://portal.stedi.com/app/settings/developer/event-destinations).
2. Click **All event destinations**, then **+ New destination**.
3. Enter a name, the `https://` URL, an optional description and the event types to subscribe to (for example `transaction.processed`, `file.failed`, `enrollment.activated`).
4. Click **Create destination**. Stedi shows the signing secret once in a modal. Save it.

### API

```bash
curl --request POST \
  --url "https://events.us.stedi.com/2026-02-01/destinations" \
  --header "Idempotency-Key: $(uuidgen)" \
  --header "Authorization: <api_key>" \
  --header "Content-Type: application/json" \
  --data '{
    "name": "My Destination",
    "destinationUrl": "https://example.com/webhooks/stedi",
    "eventTypes": ["transaction.processed", "file.failed", "enrollment.activated"],
    "status": "ENABLED"
  }'
```

The response includes `id` (`dst_...`) and `signingSecret` (`whsec_...`).

## Get Your Signing Secret

Each destination has its own secret, shaped `whsec_` + base64. Find it on the destination's **Overview** tab, or:

```bash
curl --url "https://events.us.stedi.com/2026-02-01/destinations/{destinationId}/secret" \
  --header "Authorization: <api_key>"
# {"signingSecret":"whsec_YWJjZGVm..."}
```

Store it in `STEDI_WEBHOOK_SECRET`.

## Rotate the Secret

Portal: destination **Overview** > **Signing secret** > rotate icon > choose an expiry for the old secret (0, 24 or 720 hours). API: `POST /destinations/{destinationId}/secret/rotate` with `{"previousSecretExpiryHours": 24}` (default 24).

Until the old secret expires, each delivery carries two `v1,` signatures in `webhook-signature`, one per secret. Verify against both (accept if either matches). A destination holds at most two active secrets, so wait for the expiry before rotating again.

## Test Your Endpoint

Open the destination, go to **Event deliveries** and click **Ping**. Stedi sends an `event.ping`. Review the status code and the full request and response for each attempt there, or on the **Events** page. You can retry any delivery from either place.

## Test Mode vs Production

Events carry `"environment": "PRODUCTION"` or the test equivalent. Use separate destinations (and secrets) per environment.

## Manage and Recover

Disabling a destination stops new events and pauses retries until you re-enable it. Deleting it stops everything immediately. After an outage, list events with status `FAILED` via `List Event Destination Events`, fetch each with `Get Event Destination Event` and process them. Their timestamps will be old, so don't apply a short replay window to recovered events.
