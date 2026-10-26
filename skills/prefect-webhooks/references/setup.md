# Setting Up Prefect Custom Webhook Notifications

## Prerequisites

- A Prefect workspace (Cloud or self-hosted) where you can create blocks and automations
- A public HTTPS endpoint (use `npx hookdeck-cli listen` while developing)

## Create the Custom Webhook Block

In the UI go to **Blocks > Add Block > Custom Webhook**, or save one in Python. Choose a secret
header name and value, and use the same pair in your endpoint's environment.

```json
{
  "name": "my-webhook-block",
  "url": "https://your-endpoint.example.com/webhooks/prefect",
  "method": "POST",
  "headers": { "Authorization": "Bearer {{webhook_secret}}" },
  "json_data": { "subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}" },
  "secrets": { "webhook_secret": "<your-shared-secret>" }
}
```

- The header name is your choice (`Authorization`, `X-Prefect-Secret`, ...). Set it as
  `PREFECT_WEBHOOK_HEADER` on the receiver.
- The value can be a `{{secret}}` template resolved from `secrets`. Set
  `PREFECT_WEBHOOK_SECRET` to the **exact, whole rendered value**, here
  `Bearer <your-shared-secret>`, prefix included.
- Use either `json_data` or `form_data`, not both. The template above is illustrative.
- The examples accept `POST`, `PUT`, `PATCH` and `GET`; they don't route `DELETE`.

## Attach It to an Automation

1. Go to **Automations > Create Automation**.
2. Pick a trigger, for example a flow run entering `Failed` or `Completed`.
3. Add the action **Send a notification** and select your Custom Webhook block.
4. Save. When it fires, Prefect fills `{{subject}}` and `{{body}}` and sends the request.

## Testing

From Python you can send a test notification without an automation:

```python
from prefect.blocks.notifications import CustomWebhookNotificationBlock

CustomWebhookNotificationBlock.load("my-webhook-block").notify("Hello from Prefect!")
```

Prefect sends the user agent `Prefect Notifications`.
