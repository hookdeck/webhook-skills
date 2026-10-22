# Setting Up Granola Webhooks

## Prerequisites

- A Granola Business or Enterprise plan (webhooks are not available on other plans)
- A Granola API key (`grn_...`) to fetch the notes referenced by events
- A public HTTPS URL for your endpoint (private-network addresses are rejected)

## How Do I Create a Webhook in Granola?

For notes across Granola:

1. Go to **Settings → Connectors → Webhooks**.
2. Select **Set up a webhook**.
3. Choose which notes and events to receive, then enter your endpoint URL.
4. Create the webhook and **copy its signing secret**. You can also send a test event and create a compatible API key from the confirmation dialog.

For one folder: open the folder, select **Integrations → Webhooks → Create new webhook**, choose events and the URL, and copy the secret. Granola filters the webhook to that folder and its subfolders.

## How Do I Create a Webhook Through the API?

```bash
curl -X POST "https://public-api.granola.ai/v1/webhook-endpoints" \
  -H "Authorization: Bearer grn_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/webhooks/granola", "scopes": ["personal", "public"]}'
```

The response includes `signing_secret` (`whsec_...`). **It is returned only in this response and cannot be retrieved later**, so store it as `GRANOLA_WEBHOOK_SECRET`.

| Scope | Events you'll receive for |
|-------|---------------------------|
| `personal` | Notes you own, notes shared directly with you, and notes in private folders shared with you |
| `public` | Notes visible to everyone in the workspace |
| `workspace` | Notes a workspace API key can read. With a workspace key pass exactly `["workspace"]`; it can't be changed later |

Optional fields: `events` (omit for all of `note.access_granted`, `note.edited`, `note.generated`) and `folder_ids` (limit to folders and their subfolders; match `scopes` to the folder's visibility).

You can also list, update and delete endpoints under `/v1/webhook-endpoints`.

## Authentication

Deliveries are authenticated by the Standard Webhooks signature only; there is no API key, Basic Auth or IP allowlist on incoming requests. The Authorization bearer key is used only when calling Granola's API.

## Local Testing

```bash
npx hookdeck-cli listen 3000 granola --path /webhooks/granola
```

Use the printed URL as the endpoint URL, then send a test event from the creation dialog.
