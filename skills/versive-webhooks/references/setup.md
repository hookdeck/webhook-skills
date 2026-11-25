# Setting Up Versive Webhooks

## Prerequisites

- A Versive organization ([getversive.com](https://getversive.com/)) where you're an owner or admin
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Versive Webhook Endpoint?

Webhooks are an organization-level integration. Organization owners and admins set them up in the
Versive app; creating and rotating destinations is not part of the public `v1` REST API.

1. Go to **Organization → Connectors** and open **Webhooks**.
2. Select **Set up webhooks**.
3. Select **Manage endpoints** to open the webhooks portal in a new tab.
4. Add your HTTPS endpoint, e.g. `https://example.com/webhooks/versive`, and choose which events it
   receives. An endpoint with no event filter receives every event type.
5. Return a `2xx` once your service has accepted the event. Anything else is retried.

The portal link expires after one hour. Open the **Webhooks** panel again to get a new one.

Turning webhooks off stops deliveries but keeps your endpoints. Events that happen while webhooks
are off are not sent later.

If the Versive team set up your webhooks before self-serve setup, you receive
`interview.screened_out` only after an owner or admin turns webhooks off and back on. If your
receiver doesn't check `event_type`, subscribe the endpoint to `interview.completed` only before
you do that.

## Where Do I Find the Signing Secret?

Each endpoint has its own signing secret, which Versive calls "your endpoint secret". Copy it from
the endpoint in the webhooks portal, where you can also rotate it. Versive's docs don't print its
format. Deliveries are signed by Svix, whose secrets look like `whsec_<base64>`, so expect a value
starting with `whsec_`. Store the full value, prefix included:

```bash
VERSIVE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. After rotating, update the secret everywhere you verify.

## How Do I Test It?

Use the Hookdeck CLI tunnel, add the tunnel URL as an endpoint in the portal, and complete a real
interview in a study. The portal's delivery logs show each attempt, and it can replay messages.

```bash
npx hookdeck-cli listen 3000 versive --path /webhooks/versive
```

Put the endpoint's signing secret in `.env`.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a different endpoint |
| No deliveries arrive | Webhooks are turned off, the endpoint URL is wrong, or the endpoint isn't subscribed to that event: check the portal's delivery logs |
| No `interview.screened_out` deliveries | Webhooks were set up by the Versive team before self-serve setup: turn them off and back on |
| "Timestamp too old" on retries or replays | The SDK's fixed 5-minute window; use the manual verifier in [verification.md](verification.md) |
