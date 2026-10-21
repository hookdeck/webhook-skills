# Setting Up WeTravel Webhooks

## Prerequisites

- The **main** WeTravel account. Only the main account can manage webhooks;
  team members / sub-accounts can't.
- A WeTravel **API key**. The "Webhooks" section of your profile only appears
  once an API key has been generated.
- A public HTTPS endpoint (use the Hookdeck CLI below for local development).

## Enable Webhooks

Webhooks are disabled by default for every account.

1. Generate an API key if you don't have one yet.
2. Go to **Profile → Edit Profile** and find the **Webhooks** section.
3. Click **Yes** to enable webhooks.

## Register Your Endpoint

1. In the Webhooks section, click **Manage Webhooks**. A Svix-powered endpoint
   manager opens in a new window.
2. Click **+ Add Endpoint** (top right).
3. Enter your endpoint URL, e.g. `https://example.com/webhooks/wetravel`.
4. Choose to receive all events, or pick specific ones (`booking.created`,
   `booking.updated`, `payment.created`, `payment.updated`,
   `transaction.created`, `transaction.updated`, `trip.published`,
   `lead.created`, `lead.updated`).
5. Save. You can add several endpoints, and edit, disable or delete them later
   by clicking on them.

## Get Your Signing Secret

1. In **Manage Webhooks**, click your endpoint.
2. Find **Signing Secret** (masked by default) and reveal it.
3. Copy it into your environment. It starts with `whsec_`:

   ```bash
   WETRAVEL_WEBHOOK_SECRET=whsec_xxxxx
   ```

Each endpoint has its own secret. If you rotate it in the portal, update your
environment; during rotation the `svix-signature` header can contain more than
one signature, which the `svix` library handles.

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 wetravel --path /webhooks/wetravel

# FastAPI
npx hookdeck-cli listen 8000 wetravel --path /webhooks/wetravel
```

No account required. Use the printed URL as the endpoint URL in Manage Webhooks.

## Testing

- Check **Event Catalog** in Manage Webhooks for sample payloads.
- If the endpoint view has a **Testing** tab (standard in Svix App Portals),
  send an example event to confirm your handler verifies and returns `200`.
- Otherwise, create a test booking on a test trip and watch for
  `booking.created`.
- The endpoint view also shows message attempts, so you can see failed
  deliveries and resend them.
