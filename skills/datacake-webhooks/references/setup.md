# Setting Up Datacake Webhooks

## Prerequisites

- A Datacake workspace
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 datacake --path /webhooks/datacake` for local development)

## Choose Your Secret

Pick a long, unguessable value (a UUID or random string) known only to Datacake and your receiver.
Don't commit it to a public repository. You will enter it twice: once as a header in Datacake and
once in your environment:

```bash
DATACAKE_WEBHOOK_HEADER=Authorization            # the header name
DATACAKE_WEBHOOK_SECRET=Bearer your-long-token   # the exact, whole header value
```

Datacake's docs use `Authorization` with the value `Bearer ABC123`, but any header name works. Your
receiver compares the whole value as typed, so if you include `Bearer ` in Datacake, include it in
`DATACAKE_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In the workspace sidebar, open **Integrations > Webhooks**.
2. Click **Add Webhook**.
3. Set the **Endpoint URL** (for example `https://example.com/webhooks/datacake`).
4. Optionally add a **Description**.
5. Under **Events to send**, choose the events you need. They arrive as `device_measurement`,
   `decoder_output` and `downlink` in the body's `event` field.
6. Under **Headers**, add the secret header: **Name** `Authorization` (or any custom name), **Value**
   `Bearer ABC123` (use your own token).
7. Click **Create Webhook**. Your endpoint starts receiving data.

## Setting It Up in Hookdeck

Create a Hookdeck source with the Datacake type and use its URL as the webhook's **Endpoint URL**.
Enter the header name you added under **Headers** as the source's **API Key Header**, and the whole
header value as its **API Key**. A request without the right value still gets `200` from Hookdeck,
but Hookdeck records it as failed verification and doesn't forward it.

## Test Mode vs Live Mode

Datacake has no test mode. Point the webhook at a request inspector such as
[webhook.site](https://webhook.site/) or the Hookdeck CLI tunnel first, then at your endpoint. Open
the webhook in Datacake to see recent requests and the responses your server returned.

## Firewalls and IP Allowlists

Don't rely on IP allowlisting. Datacake is cloud-native and scales dynamically, so its outgoing IPs
aren't reliable. Authenticate with the secret header instead. If you receive webhooks in Cake Red
(Datacake's hosted Node-RED), make sure its firewall path allow list includes the webhook path.
