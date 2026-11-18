# Setting Up Merge Webhooks

## Prerequisites

- A Merge account with access to the Webhooks configuration page
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Create the Webhook

1. Open [Webhooks](https://app.merge.dev/configuration/webhooks) in the Merge dashboard and click **+Webhook**.
2. Enter your URL, such as `https://your-app.example.com/webhooks/merge`.
3. Pick the events: Linked Account linked, synced, deleted or issues, Common Model synced, changed data, deleted data, or the async operations.

Webhooks are shared across your Merge organization.

## 2. Copy the Signature Key

The **Security** module on the same Webhooks page shows your signature key. It's unique to your organization and covers every webhook. Set it as `MERGE_WEBHOOK_SIGNATURE_KEY`.

You can regenerate it if it leaks. Every receiver (and Hookdeck source) then needs the new key.

## 3. Send a Test Request

Click **Send test POST request** next to your URL. Merge sends a sample payload to it.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 merge --path /webhooks/merge
```

Use the printed URL for the webhook, then send a test request.

## Using Hookdeck

Create a source with the **Merge** source type and paste the signature key from the Security section. Hookdeck verifies `X-Merge-Webhook-Signature` and ignores `=` padding on both sides. Verification is optional on the source, and Hookdeck applies no timestamp window. Update the source if you regenerate the key.
