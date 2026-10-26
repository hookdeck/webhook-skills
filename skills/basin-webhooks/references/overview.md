# Basin Webhooks Overview

## What Are Basin Webhooks?

Basin is a form backend. A custom webhook reposts each form submission to your URL. The request
body is what Basin received on the original submission, in the payload type you choose. Only
non-spam submissions trigger a webhook by default; a checkbox enables webhooks for all submissions.
Failed deliveries are retried up to 15 times over 24-28 hours with exponential backoff.

## Event Types

Basin has **no event types**: every webhook is a form submission. There is no event name header or field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| form submission | A submission is received on a form with a webhook URL | Sync to CRM/DB, notify a team, start a workflow |

## Payload Types

| Type | Shape |
|------|-------|
| JSON | `{"email": "...", "name": "...", "id": "submission_id", "attachments": [{"attachment_proxy_url": "...", "public_url": "..."}]}` |
| Data wrapped JSON | `{"data": { ...same fields... }}` |
| Form URL encoded | `email=...&name=...&id=...` |
| Customer.IO, Microsoft Teams, MailerLite, Pardot, custom template | Vendor- or template-specific shapes |

Fields are whatever your form submits, plus `id` and `attachments`.

## Full Event Reference

See [Basin's webhook documentation](https://docs.usebasin.com/integrations/webhooks/).
