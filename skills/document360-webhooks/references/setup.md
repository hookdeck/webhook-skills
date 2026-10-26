# Setting Up Document360 Webhooks

## Prerequisites

- A Document360 knowledge base, with the Owner or Admin role to map notification events
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 document360 --path /webhooks/document360`)
- A secret value you generate for the header (for example a long random string)

## Create the Webhook Channel

1. Go to **Settings** > **Knowledge base portal** > **Notifications**. The **Channels** tab opens.
2. Click **New channel** and select **Webhook**.
3. Enter a unique **Friendly name** (for example `Docs-Endpoint-ArticlePublish`).
4. Choose the **Request method**: **POST** or **PUT**. Your endpoint must accept whichever you pick.
5. Enter your endpoint in **Webhook URL**.
6. Choose the **Request content** format for the payload.
7. Under **Authorization key**, click **Add** and add a header as a key-value pair, for example key
   `X-Docs-Secret`, value `your-shared-secret`. This is the credential your endpoint checks.
8. Click **Save**.

The separate **Authorization key** field does not document which header it sends. Use a key-value
header instead, because its name and value are the ones you chose and know.

Set the same pair in your environment:

```bash
DOCUMENT360_WEBHOOK_HEADER=X-Docs-Secret
DOCUMENT360_WEBHOOK_SECRET=your-shared-secret
```

If you type `Authorization` as the key and `Bearer abc123` as the value, then
`DOCUMENT360_WEBHOOK_SECRET` must be exactly `Bearer abc123`, prefix included.

## Map Events to the Channel

The channel does nothing until events are mapped.

1. Open the **Notification mapping** tab (Owner or Admin role required).
2. Turn on **All events**, a module, or individual events such as **Article published**.
3. Click **Map to channel** (or the icon next to an event) and pick your webhook channel.

Enabling an event without mapping a channel delivers nothing.

## Using Hookdeck

Create a Hookdeck source of type **Document360** and enter the header name and exact value. The
source pre-selects **POST** without managing the method. If you picked **PUT** above, also allow
PUT on the source, or those requests are rejected before reaching your destination. Use the
source URL as the channel's **Webhook URL**.

## Test

Publish a test article (with `Article published` mapped), or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/document360 \
  -H "Content-Type: application/json" \
  -H "$DOCUMENT360_WEBHOOK_HEADER: $DOCUMENT360_WEBHOOK_SECRET" \
  -d '{"Knowledge base name":"Docs","Event":"Article published","Article name":"Getting Started"}'
```

## Network Notes

The channel docs don't mention a fixed sender IP range, so an IP allowlist
isn't an option. Rely on the secret header over HTTPS.
