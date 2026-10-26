# Setting Up Payroc Webhooks

Covers event subscriptions only, not Hosted Payments Page callbacks.

## Prerequisites

- Payroc API credentials
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 payroc --path /webhooks/payroc` locally)

## Choose Your Secret

You supply the secret yourself: a string of 16 to 64 characters. Store it as
`PAYROC_WEBHOOK_SECRET`. Payroc sends it unchanged in the `Payroc-Secret` header on every request.

## Create the Event Subscription

Event subscriptions are created through the API only; there is no dashboard setup. Follow
Payroc's [create an event subscription](https://docs.payroc.com/guides/events/create-event-subscription)
guide. In the subscription's `notifications` entry set:

- the URL of your endpoint (e.g. `https://example.com/webhooks/payroc`)
- `secret`: the value you chose above

Select the event types you want, such as `processingAccount.status.changed`,
`processingAccount.riskStatus.changed`, `processingAccount.signature.signed` and
`terminalOrder.status.changed`, and set the subscription's support email address, which Payroc
emails if delivery keeps failing.

## Test

Replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/payroc \
  -H "Content-Type: application/json" \
  -H "Payroc-Secret: $PAYROC_WEBHOOK_SECRET" \
  -d '{"specversion":"1.0","type":"processingAccount.status.changed","version":"1.0.0","source":"payroc","id":"123e4567-e89b-12d3-a456-426614174000","time":"2024-07-02T15:30:00.000Z","datacontenttype":"application/json","data":{"processingAccountId":"38765","status":"entered"}}'
```

## Rotating the Secret

Update the subscription's secret and `PAYROC_WEBHOOK_SECRET` together, or deliveries will fail with
401 and Payroc will retry. Rotate immediately if the secret leaks.
