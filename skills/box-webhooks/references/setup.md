# Setting Up Box Webhooks

## Prerequisites

- A Box developer app (Developer Console) with permission to manage webhooks
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Signature Key

1. Open your app in the [Box Developer Console](https://account.box.com/developers/console).
2. Click the **Webhooks** tab, then **Manage signature keys**.
3. Click **Generate Key** to create the primary (and optionally secondary) key, and copy the value.

Every webhook then includes `BOX-SIGNATURE-PRIMARY` and `BOX-SIGNATURE-SECONDARY`. Set the **primary** key as `BOX_WEBHOOK_SECRET`.

> Paste the primary signature key from the Box Developer Console; only the primary signature is verified, so during key rotation paste the key that signs it. Only V2 webhooks are signed.

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

Box signs every delivery with both keys, so you can change one at a time. Verification here uses the primary header only, so paste the key that currently produces `BOX-SIGNATURE-PRIMARY`. If you replace the primary key, update `BOX_WEBHOOK_SECRET` (or the Hookdeck source secret) at the same time.

## Hookdeck Source

Create a source of type **Box** and paste the primary signature key. Hookdeck verifies `BOX-SIGNATURE-PRIMARY` over the body followed by `BOX-DELIVERY-TIMESTAMP`. Hookdeck's Box source pre-selects POST without managing the method (Box's docs don't name one), so if the sender uses another method, allow it on the source too. Use the source URL as the webhook `address`.

## Test Mode vs Live Mode

Use a separate Box app (for example in a test or sandbox enterprise) for testing, since keys are per app.

## Local Development

```bash
npx hookdeck-cli listen 3000 box --path /webhooks/box
```

Use the Hookdeck URL as the webhook `address`, then upload a file to the target folder.
