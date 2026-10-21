# Setting Up ZoomInfo Webhooks

## Prerequisites

- A ZoomInfo organization with Enterprise API access and the Scaling API (needed for the Monitoring API)
- At least one contact or company already enriched through the API
- Admin Portal access
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 zoominfo --path /webhooks/zoominfo` for local development)

## Create the Webhook and Validate

1. Go to **Admin Portal > Integrations > API & Webhooks**.
2. In **Webhooks**, click **Create New**.
3. Enter a **Webhook Title** and your **Target URL**.
4. Click **Validate**. ZoomInfo sends a sample JSON payload (a full contact payload) to the URL.

The token does not exist yet at this point, so your endpoint must accept this request. In the examples, leave `ZOOMINFO_WEBHOOK_TOKEN` unset for this step; they acknowledge with `200` and do not process it.

## Get Your Verification Token

1. Click **Generate New Token**.
2. Click **Copy Token** (or **Download Token**).
3. Store it as `ZOOMINFO_WEBHOOK_TOKEN` and restart your app. ZoomInfo warns to keep it secure.

You can generate a new token periodically. After doing so, update `ZOOMINFO_WEBHOOK_TOKEN` at the same time, or deliveries fail with `401`.

## Add Subscriptions

1. Click **Create Subscription**.
2. Pick the **Object Type** (Contact or Company) and the **Event** (Update).
3. Pick the payload: full (default), or toggle on **changed attributes only**.
4. Click **Save**; repeat for more subscriptions; click **Save** again.

## Activate

1. Open the webhook's **Edit Webhook** page.
2. Switch **Activation Status** to ON and click **Save**. The status shows **Active**.

## Testing

There is no test mode in the guide beyond **Validate**. Re-run Validate after changing the target URL. The guide does not say whether Validate sends `x-zoominfo-token`, so if you re-validate with a token configured and get `401`, unset the token for that step.
