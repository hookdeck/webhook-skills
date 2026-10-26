# Setting Up Plane Webhooks

## Prerequisites

- A Plane workspace where you are an **Owner or Admin** (only they can manage webhooks)
- Your application's webhook endpoint URL (use `npx hookdeck-cli listen 3000 plane --path /webhooks/plane` locally)
- The URL must be publicly reachable over `http://` or `https://`; localhost and private IPs are not accepted

## Register Your Endpoint

1. Go to **Workspace settings → Webhooks**.
2. Click **Add webhook**.
3. Enter a **Webhook title** (a label for your own reference) and the **Payload URL**, e.g. `https://example.com/webhooks/plane`.
4. Check the events you want, grouped by Projects, Cycles, Modules, Work items and so on. Start with `workitem.created`, `workitem.updated` and `workitem.comment.created`.
5. Optionally expand **Advanced configurations** to add a work item filter (Basic or PQL).
6. Click **Create webhook**. The webhook is active immediately.

## Get Your Signing Secret

The secret key is generated when you save the webhook. It is **not shown on screen**: Plane downloads it as a CSV file at the moment you click **Create webhook**. It looks like `plane_wh_` followed by a random string. Store it as `PLANE_WEBHOOK_SECRET`.

To see it again later:

1. Go to **Workspace settings → Webhooks**, click **···** on the webhook row and choose **Edit**.
2. In the **Secret key** section, click the eye icon to reveal it, or the copy icon to copy it.

To rotate it, click **Re-generate key** in the same section. The old key stops working **immediately**, so update your server first.

## Manage the Webhook

- **Disable / Enable**: pauses delivery without losing configuration. Events that fire while disabled are not queued or delivered.
- **Delete**: removes the webhook and its delivery history permanently.
- After 5 failed delivery attempts Plane disables the webhook itself and emails the creator. Re-enable it from the webhook list once your endpoint is fixed.

## Test Mode vs Live Mode

There is no test mode and no manual redelivery. Create or update a work item in the workspace to trigger an event, and use the webhook's detail view (**Workspace settings → Webhooks**, then click the webhook) to see total, successful and failed deliveries, plus the response time of each attempt.

## Webhook Versions

Webhooks created before v2 carry a *(deprecated)* tag and use older event names. To migrate, create a new webhook with the same URL and events, save its new secret key, update your handler to the v2 payload, then delete the old one.
