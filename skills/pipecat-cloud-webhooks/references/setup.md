# Setting Up Pipecat Cloud Webhooks

## Prerequisites

- A Pipecat Cloud organization ([pipecat.daily.co](https://pipecat.daily.co/))
- A publicly reachable endpoint. Only `http` and `https` URLs are accepted; use HTTPS for
  anything reachable from the internet (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Pipecat Cloud Webhook Endpoint?

Endpoints are managed per organization in the dashboard only. There is no CLI command or
API-key-authenticated REST route for endpoint management.

1. Go to the [Pipecat Cloud dashboard](https://pipecat.daily.co/) and select
   **Settings > Webhooks** for your organization.
2. Click **Add endpoint** and enter your URL, e.g. `https://example.com/webhooks/pipecat-cloud`.
3. Select at least one event type. Pipecat Cloud only delivers the types you subscribe to. An
   endpoint with no event types is rejected: disable or delete it instead.
   A useful start is `build.succeeded`, `build.failed`, `deployment.updated`,
   `service.suspended`, and `spend.limit_reached`.
4. Return a `2xx` as soon as the signature checks out. Anything else is retried.

## Where Do I Find the Signing Secret?

Use the key icon on the endpoint's row to reveal its signing secret. It looks like `whsec_...`.
Each endpoint has its own secret. Store the full value, prefix included:

```bash
PIPECAT_CLOUD_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

> **Deleting an endpoint destroys its signing secret and delivery history.** Recreating an
> endpoint at the same URL issues a **new** secret, and a handler still using the old one rejects
> every delivery. To stop deliveries temporarily, disable the endpoint instead.

## How Do I Send a Test Event?

Each endpoint row has a **send test event** action. It delivers a schema-generated sample of any
event type the endpoint subscribes to, signed like a real delivery. The endpoint must be
enabled. The action reports that the event was *accepted*, not delivered: check the delivery
history for the outcome.

Test deliveries carry a `webhook-test: true` header, which real events do not. Branch on that
header to route them differently, not on the payload: the sample names a service and region that
may exist in your account.

## Watching and Replaying Deliveries

The history icon on an endpoint's row opens its delivery history (90 days, newest first). Each
delivery shows its event type, status, the exact payload, and every attempt with your response
status, duration and response body. Any delivery can be re-dispatched. A replay reuses the
original payload and `svix-id`, so your deduplication treats it as the same message.

Other row actions: **edit** (change the URL or subscriptions) and an **enable/disable** switch.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a deleted-and-recreated endpoint |
| No deliveries arrive | The endpoint is disabled, or not subscribed to the event type you expect |
| An expected event never fires | Some events are narrow: a deploy with no configuration change emits nothing, and `build.started` is best-effort |
| "Webhooks are not configured on this environment." | Webhooks aren't available on your organization's environment: contact Pipecat Cloud support |
