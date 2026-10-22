# Setting Up Medusa Webhooks

## Prerequisites

- A Medusa Cloud organization on the Launch, Scale, or Enterprise plan
- A public HTTPS URL for your handler (e.g. `https://your-app.com/webhooks/medusa`)

## Create the Endpoint and Get Your Signing Secret

1. Make sure you're viewing the correct organization's dashboard in Cloud.
2. Click a project from the dashboard.
3. Click **Webhooks** > **Endpoints** in the sidebar.
4. Click **Create endpoint**, enter the **Endpoint URL** (required), and leave **Enabled** on (the default).
5. Click **Create endpoint**.
6. On the endpoint card, find **Signing Secret**. It is hidden by default: click the eye icon to reveal it or the copy icon to copy it.
7. Store it as `MEDUSA_WEBHOOK_SECRET`.

Only one endpoint is allowed per organization (the **Create endpoint** button is disabled once one exists), and it receives events from every project and environment. All eight events (`build.*`, `deployment.*`) are delivered; there is no per-event subscription in the form, so ignore the ones you don't need.

## Managing the Endpoint

- **Edit URL**: change the URL field on the card and click **Save**.
- **Rotate the secret**: click the rotate icon. The previous secret is invalidated **immediately**, so update `MEDUSA_WEBHOOK_SECRET` right away or deliveries will fail verification.
- **Disable**: toggle the switch on the card. No events are sent until re-enabled.
- **Delete**: irreversible; in-flight deliveries fail.

Track deliveries in the Cloud dashboard's webhook events view.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 medusa --path /webhooks/medusa
```

Use the tunnel URL as the **Endpoint URL**, then push a commit to trigger a build, which sends `build.created`.
