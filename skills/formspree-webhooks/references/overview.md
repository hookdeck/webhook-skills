# Formspree Webhooks Overview

## What Are Formspree Webhooks?

Formspree (formspree.io) is a form backend. Its Webhook plugin (Professional and Business plans) is enabled per form and sends an HTTP `POST` to your URL on **every new submission**. Use it with serverless functions, your own server, or other services.

## Webhook Types

When you enable the plugin you choose one of three types:

| Type | What it sends |
|------|---------------|
| Simple Webhook | The normal JSON payload below, as a `POST` |
| Build Hook | A webhook with an **empty body**, for triggering builds (for example on Netlify) |
| REST Hook | Same payload, plus a confirmation request carrying an `X-Hook-Secret` header at creation time. The REST Hooks protocol is sunset; prefer Simple Webhook for new integrations |

## Events

Formspree has no event types: there is no event-name field or header, and every delivery is a new submission. The examples label it `form_submission` in logs for readability; that string is not sent by Formspree.

## Payload Structure

```json
{
  "form": "<form hashid>",
  "keys": ["keys", "in", "the", "order", "they", "were", "submitted"],
  "submission": {
    "_date": "2026-10-26T10:00:00",
    "field": "value",
    "other-fields": "other value"
  }
}
```

| Field | Meaning |
|-------|---------|
| `form` | The form's hashid |
| `keys` | Field names in submission order |
| `submission` | The fields, plus `_date` |

Check the type of each field before using it, even after verifying the signature.

## Delivery and Retries

- Formspree expects a `2xx` within **3 seconds**.
- Any other status, or no response in time, is retried up to **10 times**.
- A retried delivery can arrive more than once, and the payload carries no delivery id. Make the handler safe to run repeatedly (the examples hash the raw body).
- Save or durably queue the submission, then return `2xx`; a background failure after a `2xx` is not retried.

## Full Reference

See Formspree's [Webhooks documentation](https://help.formspree.io/articles/plugins/webhooks/).
