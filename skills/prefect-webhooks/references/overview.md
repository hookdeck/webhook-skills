# Prefect Webhooks Overview

## What Are Prefect Webhooks?

Prefect automations can run a **Send a notification** action. When the notification block is a
**Custom Webhook** block, Prefect makes an HTTP request to the URL you configured. That request
is what this skill receives. (Prefect Cloud's own "webhooks" are inbound endpoints that create
events in Prefect; they are a different feature.)

The block (`CustomWebhookNotificationBlock`) has these relevant settings:

| Field | Meaning |
|-------|---------|
| `url` | Where to send the request (your endpoint) |
| `method` | `GET`, `POST`, `PUT`, `PATCH` or `DELETE`; defaults to `POST` |
| `json_data` | JSON payload template (don't combine with `form_data`) |
| `form_data` | Form-encoded dict or raw string payload template |
| `headers` | Custom headers: put your secret header here |
| `params`, `cookies` | Optional query params and cookies |
| `secrets` | Values you can reference as `{{name}}` in any other field |

Requests are **unsigned**. There is no signature header and no timestamp.

## Payload

Prefect adds no event field. The body is your `json_data` or `form_data` template with
`{{subject}}`, `{{body}}` and `{{name}}` substituted (`name` is the block's name; `subject` is
the string `"null"` when the notification has none). The examples assume this **illustrative** template:

```json
{"subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}"}
```

## Common Notifications

There are no event type strings to match. What you receive depends on the automation:

| Notification (illustrative) | Triggered When |
|-----------------------------|----------------|
| flow run Failed notification | An automation on flow runs entering `Failed` sends the block |
| flow run Completed notification | An automation on flow runs entering `Completed` sends the block |

Tell them apart by matching on `subject`/`body`, or by adding your own field to the template.

## Authentication

Add a secret header in the block's `headers` and compare it on receipt; see
[verification.md](verification.md). A static shared credential authenticates the sender, not the
body, and gives no replay protection.

## Full Reference

- [Custom notifications guide](https://docs.prefect.io/v3/how-to-guides/automations/custom-notifications)
- [Custom Webhook block source](https://github.com/PrefectHQ/prefect/blob/main/src/prefect/blocks/notifications.py)
