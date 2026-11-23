# Setting Up Box Webhooks

## Prerequisites

- A Box developer app (Developer Console) with permission to manage webhooks
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Signature Key

1. Open your app in the [Box Developer Console](https://account.box.com/developers/console).
2. Click the **Webhooks** tab, then **Manage signature keys**.
3. Click **Generate Key** to create the primary (and optionally secondary) key, and copy the value.

Every webhook then includes `BOX-SIGNATURE-PRIMARY` and `BOX-SIGNATURE-SECONDARY`. Set the **primary** key as `BOX_WEBHOOK_SECRET`.

> Paste the primary signature key from the Box Developer Console. Add the secondary key to keep V2 deliveries verified while rotating either key.

## Register Your Endpoint

Create a V2 webhook through the API for one file or folder:

```bash
curl -X POST https://api.box.com/2.0/webhooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target": { "id": "FOLDER_ID", "type": "folder" },
    "address": "https://your-endpoint.example/webhooks/box",
    "triggers": ["FILE.UPLOADED", "FILE.DOWNLOADED", "FOLDER.CREATED"]
  }'
```

Choose triggers from the [triggers list](https://developer.box.com/guides/webhooks/triggers/). Some apply only to files, some only to folders.

## Rotate Keys

On the Hookdeck source, configure both keys before rotating. Reset the primary in Box, then save the new primary on the source. The secondary verifies deliveries during that update. Wait until deliveries signed with the old primary have arrived before resetting the secondary in Box and updating it on the source.

The standalone examples check only the primary key in `BOX_WEBHOOK_SECRET`. Changing it can return `401` for deliveries still in flight with the old primary signature. For uninterrupted rotation, configure a secondary key in your handler before the reset and accept a match from either key and its corresponding header.

## Hookdeck Source

Create a source of type **Box** and enter the app’s **Primary Signature Key**. For rotation, also enter its **Secondary Signature Key**. Use the source URL as the webhook `address`.

## Test Mode vs Live Mode

Use a separate Box app (for example in a test or sandbox enterprise) for testing, since keys are per app.

## Local Development

```bash
npx hookdeck-cli listen 3000 box --path /webhooks/box
```

Use the Hookdeck URL as the webhook `address`, then upload a file to the target folder.
