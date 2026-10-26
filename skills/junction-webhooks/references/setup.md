# Setting Up Junction Webhooks

## Prerequisites

- A Junction account with access to the [Junction Dashboard](https://app.junction.com)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Junction Webhook Endpoint?

1. In the Junction Dashboard, open the **Webhooks** section. It is a Svix portal where you add
   endpoints, filter events, inspect deliveries and test.
2. Add an endpoint with your URL, e.g. `https://example.com/webhooks/junction`.
3. Choose the event types to receive. Wearable integrations usually start with
   `provider.connection.created`, `provider.connection.error`, the `historical.data.*.created`
   events and the `daily.data.*` events for the resources they use. Lab integrations add the
   `labtest.*` events.
4. Return a `2xx` within 15 seconds. Acknowledge fast and process on a queue. Any other status,
   `3xx` redirects included, counts as a failure and is retried. Return `200` for events you
   don't handle.

You can also manage endpoints, headers and secrets programmatically through the
[Team Webhooks API](https://docs.junction.com/api-reference/org-management/team-webhook/list.md).
There is no challenge or handshake to answer when you add an endpoint.

[ETL Pipelines](https://docs.junction.com/webhooks/etl-pipelines/overview.md) are an alternative
destination: Junction streams the same events to Google Cloud Pub/Sub, RabbitMQ or Azure Event
Hubs instead of calling an HTTP endpoint.

## Where Do I Find the Signing Secret?

In the Junction Dashboard, go to **Webhooks**, open the endpoint and copy the **Signing Secret**.
You can also read it with the API's [Get Webhook Secret](https://docs.junction.com/api-reference/org-management/team-webhook/get-secret.md)
call and replace it with [Rotate Webhook Secret](https://docs.junction.com/api-reference/org-management/team-webhook/rotate-secret.md).
Each endpoint has its own secret.

Junction's docs don't print a sample value. Because Svix issues it, expect the default Svix form
`whsec_<base64>`. Store the full value, prefix included:

```bash
JUNCTION_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. See [verification.md](verification.md) for how the key is derived.

## Retries, Disabled Endpoints and Recovery

Failed deliveries are retried on a fixed schedule (immediately, 5 s, 5 min, 30 min, 2 h, 5 h,
10 h, 10 h). Endpoints whose deliveries all fail for 5 days are disabled. In the dashboard you can
retry a single message or **Recover** all failed messages from a given date. A retry or recovery
reuses the original payload and `svix-id`, so your deduplication treats it as the same message.
See Junction's [Debugging](https://docs.junction.com/webhooks/debugging.md) page.
