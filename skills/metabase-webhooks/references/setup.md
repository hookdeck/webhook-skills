# Setting Up Metabase Webhooks

## Prerequisites

- A Metabase admin account, or a user with settings access
- Your application's webhook endpoint URL (HTTPS)

## Create the Webhook

1. Click the grid icon in the top right corner and select **Admin**.
2. Go to **Settings > Webhooks**.
3. Under **Webhooks for alerts**, click **Add a webhook**.
4. Fill in the form:
   - **Webhook URL**: your endpoint (for local work, the URL printed by
     `npx hookdeck-cli listen 3000 metabase --path /webhooks/metabase`).
   - **Name** and **Description**: so people can pick the right hook when setting up an alert.
   - **Authentication method**: **Choose Basic authentication on the Metabase webhook.** Set a
     username and password.
5. Save, then store the same username and password in `METABASE_WEBHOOK_USERNAME` and
   `METABASE_WEBHOOK_PASSWORD`.

Metabase's other options (None, Bearer, API key in a header or query param) are not covered by
this skill.

## Use It in an Alert

1. Open a saved question and click the **bell icon** to create an alert.
2. Add the webhook as a recipient.
3. Send a test alert to confirm delivery (the body has `alert_id: null`).

## Test Mode vs Live Mode

There is no separate test mode. A test alert uses the same payload with `alert_id: null`.
