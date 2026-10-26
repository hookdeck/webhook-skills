# Setting Up Jamie Webhooks

## Prerequisites

- A Jamie account on the Plus plan or higher
- Workspace admin access if you want a workspace-wide webhook (any member can create a personal one)
- A public **HTTPS** URL for your receiver (use the Hookdeck CLI locally)

## Choose Signature Verification

Choose Signature Verification when creating the Jamie webhook and paste its signing secret. API key mode is not supported.

Jamie offers API Key (its recommended default) and Signature Verification. Hookdeck's Jamie source verifies the `x-jamie-signature` header, so pick Signature Verification. An API key webhook sends a static key in a header, which Hookdeck's Jamie source does not check.

## Create the Webhook and Get Your Signing Secret

1. In Jamie, go to **Settings → Integrations → Webhooks** and click **Create Webhook**.
2. Enter the **URL** (your Hookdeck source URL or your endpoint), an optional description, and select the `meeting.completed` event.
3. Choose the scope: personal or workspace.
4. Under authentication choose **Signature Verification (Advanced)**.
5. Click **Create** and copy the secret. **It is shown only once.** If you lose it, regenerate it from the webhook settings.
6. Store it as `JAMIE_WEBHOOK_SECRET`. Use it exactly as shown; don't decode it.

In Hookdeck, create a source of type **Jamie** and paste the same signing secret.

## Send a Test Event

On the webhooks page, click **Test** next to the webhook. Jamie sends a realistic mock `meeting.completed` payload through the same signing and retry path. The webhook must be enabled.

## Timestamp Window

Jamie's docs recommend rejecting signatures older than 5 minutes when Jamie calls you directly. The examples leave that window off by default (`JAMIE_TIMESTAMP_TOLERANCE_SECONDS=0`); set `300` to opt in. Behind Hookdeck keep `0`: retries and replays resend the original timestamp, so a 5-minute window rejects them.

## Local Development

```bash
npx hookdeck-cli listen 3000 jamie --path /webhooks/jamie
```

Use the Hookdeck URL as the webhook URL. For FastAPI use port `8000`.
