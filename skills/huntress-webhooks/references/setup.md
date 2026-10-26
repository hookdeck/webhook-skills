# Setting Up Huntress Webhooks

## Prerequisites

- A Huntress account where you have the **account admin** role
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Add a Huntress Webhook Endpoint?

1. From the hamburger menu at the top right of the Huntress Dashboard, choose
   **Integrations**.
2. Click **Add an Integration** and choose **Webhooks** (under Notifications). If a
   webhook is already configured, Webhook is listed in the integrations table instead.
3. On the **Configure** page, click **Add Endpoint** and provide:
   - A **destination URL** (must be HTTPS), e.g. `https://example.com/webhooks/huntress`
   - The **notification categories** to receive, toggling each on or off:
     Incident Reports, Escalations, Platform Actions, Account Notices
4. Save. You can have up to **5 endpoints** per account.

## Where Do I Find the Signing Secret?

Use the three-dot menu (⋯) next to the endpoint and choose **View Signing Secret**.
Huntress's page doesn't describe the secret's format. Because Huntress signs with Svix,
expect Svix's `whsec_` + base64 format. Store it as `HUNTRESS_WEBHOOK_SECRET`:

```bash
HUNTRESS_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

## How Do I Test Locally?

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 huntress --path /webhooks/huntress

# FastAPI
npx hookdeck-cli listen 8000 huntress --path /webhooks/huntress
```

Use the printed URL as the endpoint's destination URL in Huntress.

## How Do I Send a Test Event?

Open the endpoint's three-dot menu and choose **Send Test**.

## How Do I Debug Missed Events?

Open the three-dot menu and choose **View Delivery Attempts**. The logs take a moment
to load (there is a manual refresh button). Select **View** next to an attempt to see
the **Request Body** and **Response Body**. Match attempts to your logs using `svix-id`.

## Endpoint Requirements

- Keep the **raw** request body for signature verification.
- Verify, enqueue the work, and return `200` quickly.
- General framework guidance (not from Huntress): if your framework enables CSRF protection by default, exempt the webhook route.
