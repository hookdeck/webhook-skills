# OpnForm Webhooks Overview

## What Are OpnForm Webhooks?

[OpnForm](https://opnform.com) is an open-source form builder. A form's **webhook integration** (added in the form's Integrations settings, or with `POST /open/forms/{form}/integrations`) sends each new submission as an HTTPS `POST` to a URL you choose. You can add up to 10 custom headers, and optionally set a **webhook secret** so each request is signed.

Each delivery attempt is logged per integration (List Integration Events in the API), and the latest eligible failed attempt can be retried manually through the API. OpnForm's docs do not state automatic retries, a timeout or the status code it expects, so respond `2xx` quickly and do slow work afterwards.

## What Events Are Sent?

There is **one kind of delivery**: a form submission. OpnForm sends no event name in the body or in a header, so a handler has nothing to switch on. Use `form_id` or `form_slug` to tell forms apart if one endpoint serves several.

## Event Payload Structure

```json
{
  "form_id": 123,
  "form_title": "Contact Form",
  "form_slug": "contact-form",
  "submission_id": 456,
  "edit_link": "https://opnform.com/forms/contact-form?submission_id=example",
  "submission": { "Name": "Jane Doe" },
  "data": {
    "field-id": { "value": "Jane Doe", "name": "Name", "type": "text" }
  },
  "meta": {
    "attribution": { "utm_source": "newsletter", "utm_campaign": "summer-launch" }
  }
}
```

| Field | Description |
|-------|-------------|
| `form_id`, `form_title`, `form_slug` | The form that received the submission |
| `submission_id` | Submission id; use it for idempotency |
| `edit_link` | Link to edit the submission |
| `submission` | Field name to submitted value |
| `data` | Field id to `{ value, name, type }` |
| `meta` | Extra context such as `attribution` UTM values |

Field values come from whoever filled in the form, so treat every field as untrusted: check that each one is the expected type before reading into it.

## Headers

| Header | Description |
|--------|-------------|
| `X-Webhook-Signature` | `sha256=<hex>` HMAC-SHA256 of the raw body. Only sent when a webhook secret is set |
| `Content-Type` | `application/json` |

## Full Reference

See [OpnForm's webhook documentation](https://docs.opnform.com/api-reference/integrations/webhook-security).
