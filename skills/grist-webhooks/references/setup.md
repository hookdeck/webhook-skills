# Setting Up Grist Webhooks

## Prerequisites

- A Grist document you can edit (owner access to the document settings)
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)
- Self-hosted Grist only: the endpoint's domain must be listed in `ALLOWED_WEBHOOK_DOMAINS`

## Create the Webhook

1. Open the document, then click **Settings** under the **Tools** menu at the bottom of the
   left-hand navigation panel.
2. In the **API** section of **Document Settings**, click **Manage Webhooks**.
3. Add a webhook card and fill in the fields:
   - **Name**: a short label.
   - **Event types**: adding rows, modifying rows, or both (`add` / `update`).
   - **Table**: the table that triggers the webhook.
   - **URL**: your endpoint, for example `https://example.com/webhooks/grist`.
   - **Header Authorization** (optional): the credential, for example `Bearer my-secret-token`.
   - Optionally: **Filter for changes in these columns** (semicolon-separated column IDs) and
     **Ready column** (a Toggle column).
   - **Enabled**: on.

## Get Your Credential

There is no Grist-generated secret. The **Header Authorization** value is a static string you
choose, and Grist sends it unchanged as the `Authorization` header.

Paste the Header Authorization value exactly as set in Grist, including any "Bearer " or
"Basic " prefix. Store the full string as `GRIST_AUTHORIZATION`. The handler compares the
whole `Authorization` header to it, so do not strip or decode the scheme prefix.

If you leave Header Authorization empty, Grist sends no credential and the endpoint cannot
tell Grist from anyone else.

## Local Testing

```bash
npx hookdeck-cli listen 3000 grist --path /webhooks/grist
```

Use the printed URL as the webhook **URL**. For FastAPI, use port `8000`. Then add or edit a
row in the watched table.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/grist \
  -H "Content-Type: application/json" \
  -H "Authorization: $GRIST_AUTHORIZATION" \
  -d '[{"id":29,"manualSort":29,"Title":"Trophy","Price":60}]'
```

## Troubleshooting

- Check the webhook's **Status** field in Grist for the last error and attempt count.
- **Clear Queue** discards pending payloads if the configuration was wrong.
- Grist keeps retrying failed deliveries, so fix the endpoint and the queue drains by itself.
