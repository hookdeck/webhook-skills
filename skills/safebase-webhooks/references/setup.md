# Setting Up SafeBase Webhooks

## Prerequisites

- A SafeBase Trust Center account with access to **Settings → Integrations**
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Add a SafeBase Webhook Endpoint?

1. In SafeBase, open **Settings → Integrations**.
2. In the **Data** section, click **Connect** next to Webhooks. A modal (the embedded
   Svix App Portal) opens.
3. Click **Add Endpoint**.
4. Enter your endpoint URL, e.g. `https://example.com/webhooks/safebase`.
5. Choose which events trigger it (for example `accounts.nda.completed`,
   `accessRequest.requested`, `portal.file.downloaded`). The **Event Catalog** tab lists
   every event and its data format.
6. Save. You can then configure rate limiting or pass a custom header.

## Where Do I Find the Signing Secret?

Open the endpoint in the webhook portal and copy its **Signing Secret**. Store it as
`SAFEBASE_WEBHOOK_SECRET`:

```bash
SAFEBASE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Paste the endpoint's Signing Secret from the SafeBase webhook portal exactly as shown, including any whsec_ prefix.

SafeBase's help article doesn't show the secret format or the header names. The `whsec_`
secret and `svix-*` headers are Svix defaults, which Hookdeck's SafeBase source assumes.

## How Do I Test Locally?

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 safebase --path /webhooks/safebase

# FastAPI
npx hookdeck-cli listen 8000 safebase --path /webhooks/safebase
```

Use the printed URL as the endpoint URL in SafeBase.

## How Do I Send a Test Event?

Open the **Testing** tab in the webhook portal, pick an event, and send it. The test
event has no event name in the body; that is normal, and real events do. Check the
**Logs** tab for a history of recent deliveries and whether they succeeded.

## Endpoint Notes

- Keep the **raw** request body for signature verification.
- Return `2xx` quickly and process in the background.
- If you forward to Splunk's HTTP Event Collector, use its `/raw` endpoint, not `/event`.
- To allow-list senders, use Svix's source IPs: <https://docs.svix.com/receiving/source-ips>.
