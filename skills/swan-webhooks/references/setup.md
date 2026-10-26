# Setting Up Swan Webhooks

## Prerequisites

- A Swan project (Sandbox or Live) with access to the Dashboard under **Developers > Webhooks**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 swan --path /webhooks/swan` locally)

## Set the Webhook Secret

Set a webhook secret on the Swan webhook subscription. Subscriptions without one send nothing to verify.

The secret is optional in Swan, but without it requests carry no `x-swan-secret` header and nothing
authenticates the sender. Choose a long random value and store it as `SWAN_WEBHOOK_SECRET`.

## Register Your Endpoint

In the Dashboard, go to **Developers > Webhooks**, add a subscription with your endpoint URL, the
secret above and the events you need. Or use the API:

```graphql
mutation AddPaymentEventsSubscription {
  addWebhookSubscription(
    input: {
      label: "Payment events"
      endpoint: "https://api.yourcompany.com/webhooks/swan"
      secret: "$YOUR_WEBHOOK_SECRET"
      eventTypes: ["Transaction.Booked", "Transaction.Pending", "Transaction.Rejected"]
      status: Enabled
    }
  ) {
    ... on WebhookSubscriptionSuccessPayload {
      webhookSubscription { id label endpoint eventTypes }
    }
  }
}
```

Recommendations:

- Subscribe only to the events you need, and use separate endpoints for high-volume events such as `Transaction.Booked`.
- Subscription limits per event: 10 in Sandbox, 5 in Live.
- Update a secret with `updateWebhookSubscription`, then update `SWAN_WEBHOOK_SECRET` at the same time.

## Test Mode vs Live Mode

Sandbox and Live are separate environments with separate subscriptions. Use a different secret for each
and set `SWAN_WEBHOOK_SECRET` per environment.

## Test

Create a Sandbox event (for example book a transaction on a Sandbox account), check the delivery under
**Developers > Webhooks**, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/swan \
  -H "Content-Type: application/json" \
  -H "x-swan-secret: $SWAN_WEBHOOK_SECRET" \
  -d '{"eventType":"Transaction.Booked","eventId":"evt_1","eventDate":"2021-08-18T09:35:46.673Z","projectId":"project-id","resourceId":"resource-id"}'
```

## Network Notes

Swan sends from `52.210.172.90`, `52.51.125.72` and `54.194.47.212` for both Sandbox and Live. You may
allowlist them, but the `x-swan-secret` check is still what authenticates a request.
