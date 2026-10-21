# Setting Up Segment Webhooks

## Prerequisites

- A Segment workspace with permission to add destinations
- A source that is already receiving events
- Your public HTTPS endpoint URL (no self-signed certificates), e.g. `https://your-app.com/webhooks/segment`

## How Do I Add the Webhooks (Actions) Destination?

1. In the Segment app, go to **Connections → Catalog**.
2. Search for **Webhooks (Actions)** and select it.
3. Click **Configure Webhooks (Actions)**, pick the source to connect, and name the destination.

## How Do I Get a Signing Secret?

Segment does not generate one. You choose it:

```bash
openssl rand -hex 32
```

1. Open the destination's **Settings → Advanced Settings**.
2. Paste it into **Shared Secret** and save.
3. Put the same value in your app's `SEGMENT_SHARED_SECRET`.

With the secret set, every request carries `X-Signature` (HMAC-SHA1 hex). Without it, requests are unsigned. The examples in this skill refuse requests unless a secret is configured.

## How Do I Register My Endpoint?

1. In the destination, add a mapping using the **Send** action (up to 5 mappings, each can target a different URL).
2. **Trigger:** choose which calls to forward, e.g. `type = "track"` or all event types.
3. Configure the action fields:
   - **URL:** your endpoint
   - **Method:** `POST` (`PUT` and `PATCH` are also available; the examples handle `POST`)
   - **Headers:** optional static headers
   - **Data:** leave as the default (`$.`, the whole event) unless you need a custom shape
   - **Enable Batching?** off unless you need throughput (see the batching caveat in [verification.md](verification.md))
4. Enable the mapping, then enable the destination.

## Classic Webhooks Destination

For an existing **Webhooks (Classic)** destination: under Connection Settings add up to 5 webhook URLs (with optional headers) and set **Shared Secret**. The signature works the same way.

## How Do I Test It?

- Run a local tunnel:

  ```bash
  npx hookdeck-cli listen 3000 segment --path /webhooks/segment
  ```

  Use the printed URL as the mapping **URL**.
- Use the mapping's **Test** step to send a sample event, or send events to your source and watch the **Event Delivery** tab on the destination.
- Segment's source debugger shows incoming events before they reach the destination.
