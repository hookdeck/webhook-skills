# Setting Up Stream Webhooks

## Prerequisites

- A Stream app (getstream.io Dashboard) with Chat, Feeds or Video enabled
- Your app's API key and **API secret** (Dashboard > your app > app access keys)
- A public HTTPS endpoint for your handler (or a Hookdeck source URL)

## Get Your Signing Secret

Stream has no separate webhook secret. Signatures use the app's **API secret**. Copy it from the Dashboard and store it as `STREAM_API_SECRET`. The API key (`X-Api-Key`) is public-ish; the secret must never reach clients.

## Register Your Endpoint

In the Dashboard, open your app's webhook settings and add the URL, or use the API. An
`event_hooks` update replaces the whole array, and any existing hook left out is deleted, so fetch
the current settings first and send back the complete list:

```javascript
const settings = await client.getAppSettings();
const existingHooks = settings.app.event_hooks || [];
await client.updateAppSettings({
  event_hooks: [
    ...existingHooks,
    {
      enabled: true,
      hook_type: "webhook",
      webhook_url: "https://example.com/webhooks/stream",
      event_types: ["message.new", "message.updated", "message.deleted",
                    "reaction.new", "channel.created", "user.updated", "member.added"],
    },
  ],
});
```

Omit `event_types` / choose all events to receive everything. With "all events", new event types reach your handler automatically, so ignore ones you don't handle.

## Turn Payload Compression Off

```javascript
await client.updateAppSettings({ enable_hook_payload_compression: false });
```

Apps created after May 7, 2026 default to `true`. Compressed (gzip) payloads are signed over the uncompressed bytes, and Hookdeck's Stream source cannot verify them. Do this before routing Stream through Hookdeck.

## Test Mode vs Live Mode

Stream has no test mode toggle; use a separate development app (its own API key and secret) and point it at a tunnel:

```bash
npx hookdeck-cli listen 3000 stream --path /webhooks/stream
```

Test the connection with `await client.testWebhookSettings({ webhook_url: 'https://example.com/webhooks/stream' })`.

## Restricting Access

Stream publishes its egress IP ranges (never removed, new ones may be added) if you want to firewall the endpoint. Signature verification is still the primary check.
