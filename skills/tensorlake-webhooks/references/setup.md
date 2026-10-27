# Setting Up Tensorlake Webhooks

## Prerequisites

- A Tensorlake Cloud organization and project ([cloud.tensorlake.ai](https://cloud.tensorlake.ai))
- Organization administrator or project administrator access (project members can only view
  destinations)
- A public HTTPS endpoint that accepts `POST` requests (use the Hookdeck CLI tunnel for local work)

## How Do I Create a Tensorlake Webhook Destination?

Webhooks belong to one project, so create them from the project that produces the events.

1. In [Tensorlake Cloud](https://cloud.tensorlake.ai), select the organization and project, then
   **Webhooks** in the project navigation.
2. Select **Create webhook** and enter a **Webhook name** and an absolute HTTPS **Endpoint URL**
   without embedded credentials, e.g. `https://example.com/webhooks/tensorlake`.
3. Select at least one sandbox, application, or application-request lifecycle event. The
   destination receives only the selected types from this project. A useful start is
   `tensorlake.sandbox.failed`, `tensorlake.sandbox.running`, and
   `tensorlake.application.request.completed`.
4. Create the webhook, then open the new destination to copy its signing secret and send a test
   event. There is no challenge or handshake.

## Where Do I Find the Signing Secret?

Open the destination and copy the value under **Signing secret**. It begins with `whsec_`. Each
destination has its own secret. Store the full value, prefix included, in your secret manager:

```bash
TENSORLAKE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. Treat the secret like a password and never commit or log it.

## How Do I Send a Test Event?

On the destination's page, under **Test delivery**, select one of the event types the
destination subscribes to and choose **Test webhook**. Tensorlake sends a signed synthetic payload
through the normal Svix signing and delivery path. It does not create, update, suspend,
terminate, or delete a real resource.

## Pausing or Editing a Destination

Select **Edit webhook** to change the name, URL, subscribed events, or delivery status. Turn off
**Delivery enabled** to pause attempts without deleting the configuration. Deleting a destination
removes its endpoint configuration.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or uses another destination's secret |
| `404` from your endpoint | The URL path is wrong (paths are case-sensitive) |
| `403` from your endpoint | The route requires a browser session or CSRF token; it must accept server-to-server `POST` |
| The same event arrives repeatedly | The handler isn't returning `2xx`, or isn't deduplicating on `event_id` |
| An expected event never arrives | Delivery is disabled, or the event type isn't selected for this project's destination |
