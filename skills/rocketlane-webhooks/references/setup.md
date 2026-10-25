# Setting Up Rocketlane Webhooks

## Prerequisites

- A Rocketlane account with access to **Settings** and **Automations**
- A publicly reachable **HTTPS** endpoint (Rocketlane rejects plain `http` URLs). Locally, use
  `npx hookdeck-cli listen 3000 rocketlane --path /webhooks/rocketlane`

## Create the Webhook

1. Log in to Rocketlane. From the left nav bar, click your profile icon > **Settings**.
2. Click **Webhooks**, then **Add Webhook**.
3. Enter a **Webhook Name** and the **Webhook URL**.
4. Under authentication, choose Basic authentication and set a username and password on the
   Rocketlane webhook. Basic auth is the only method supported. The step is optional in
   Rocketlane, but this skill's handlers reject any request without valid credentials.
5. Save the webhook. It is now available to automations.

Store the credentials as `ROCKETLANE_WEBHOOK_USERNAME` and `ROCKETLANE_WEBHOOK_PASSWORD`.
Use a long random password. The credentials must arrive on the first request: Hookdeck never
sends a `401` + `WWW-Authenticate` challenge, it verifies the request as received. The docs
don't say whether Rocketlane sends Basic credentials preemptively, so confirm with the test
below.

## Trigger It From an Automation

1. Go to **Automations** and create a new automation.
2. Name it and pick the trigger rule. The docs say only task triggers are supported for webhooks today.
3. Choose the trigger event and, optionally, add conditions with filters.
4. Click **Add an action** > **Send webhook**, and pick your webhook from the drop-down. A sample payload is shown.
5. Save the automation and test it.

## Test

Create or edit a task that matches the automation, then check your endpoint logs
`TASK_CREATED` or `TASK_UPDATED`. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/rocketlane \
  -u "$ROCKETLANE_WEBHOOK_USERNAME:$ROCKETLANE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"b6c68150-86f3-4a26-9a5f-66db5ca24b87","resourceType":"TASK","eventType":"TASK_CREATED","version":"1.0","data":{"task":{"taskId":278,"taskName":"task2"}}}'
```

## Delivery Notes

Respond `200` or `204` within 10 seconds. Anything else, or a timeout, is a failed delivery.
