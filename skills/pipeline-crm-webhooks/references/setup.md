# Setting Up Pipeline CRM Webhooks

## Prerequisites

- A Pipeline CRM account with access to **Admin > Automations**
- A public HTTPS URL for your endpoint that answers `2xx` (for local development, use the Hookdeck CLI below)

## How Do I Create a Webhook in Pipeline CRM?

1. Start your receiver first. The automation can only be saved after **Test** reaches your URL and receives a `2xx` (a redirect doesn't count).
2. Go to **Admin > Automations** and create an automation with the trigger you need (for example a deal changing stage).
3. Add a **Call an API** action.
4. Enter the target URL, for example `https://your-app.com/webhooks/pipeline-crm`, and an email address for failure notifications.
5. Enable signing (next section), click **Test**, then save.

You can also subscribe a URL to a single event (`event_model` × `event_action`, for example every `deal` `update`) with the Webhooks API endpoints. Those subscriptions appear in the app as **Call an API** actions.

## How Do I Enable Signing and Get the Secret?

Signing is opt-in: click **Enable signing** under **Request signing** on the automation's **Call an API** action and paste the secret into your environment as `PIPELINE_CRM_WEBHOOK_SECRET`. The secret (`whsec_...`) is shown **once** and a lost secret can't be recovered, only rotated.

**Without it, deliveries are unsigned and fail verification.** The example handlers answer `400` when the `webhook-*` headers are missing, so a "No signature headers" failure means signing is not enabled for that action, or the delivery predates enabling it.

Store the full value including the `whsec_` prefix.

## How Do I Rotate the Secret?

Click **Rotate secret**. A new secret is issued and shown once. The previous one keeps working for **7 days**, during which Pipeline CRM signs with both and sends two space-separated `v1,` entries in `webhook-signature`. Add the new secret, deploy, confirm deliveries verify, then revoke the old one. An action has at most two active secrets, so revoke one first if **Rotate** is unavailable. Verifying with a single secret works through a rotation because any matching entry is enough.

## Using Hookdeck

Hookdeck's Pipeline CRM source verifies the same Standard Webhooks signature. Signing is opt-in, so enable it first: click **Enable signing** under **Request signing** on the Call an API action and paste the secret into the Hookdeck source's webhook secret. Without it, deliveries are unsigned and fail verification.

Hookdeck retries and replays resend the original `webhook-timestamp`. If your own app also verifies with the `standardwebhooks` or `svix` library, it rejects retries after 5 minutes. Use the manual verifier in [verification.md](verification.md) to drop or widen the window.

## How Do I Test Locally?

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 pipeline-crm --path /webhooks/pipeline-crm
```

Paste the printed URL as the target URL of the **Call an API** action and use **Test**, or change a deal or person in Pipeline CRM.
