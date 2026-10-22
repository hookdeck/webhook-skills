# Paperform Webhooks Overview

## What Are Paperform Webhooks?

Paperform webhooks let developers send form submissions to their own services. Each webhook POSTs
a JSON payload to the URL you save. They're available on specific pricing plans; for non-technical
teams Paperform recommends Direct Integrations, Zapier or Make. This skill covers form-submission
webhooks, not Papersign.

Webhooks are **not signed**. Paperform supports custom headers on a webhook, and that is the
authentication mechanism: add a secret header and check it on your side.

## Triggers

Paperform has no event-type strings, and the body has no `type` field. Each webhook is configured
with a **Triggered On** setting:

| Trigger | Fires When | Common Use Cases |
|---------|------------|------------------|
| New Submission | A form is submitted | Create records, notify a team, start a workflow |
| Partial Submission | A partial response hasn't been updated in 30 minutes and hasn't been submitted | Abandoned-form follow-up, lead capture |

Only one webhook of each type is dispatched per submission record, so a partial response triggers
the Partial Submission webhook once.

## Payload Structure

```json
{
  "data": [
    {
      "title": "question 1",
      "description": "This is the first question",
      "type": "address",
      "key": "ba7ri",
      "custom_key": "address_1",
      "value": "343 Tester Road, Snohomish, Washington, 98290, United States"
    }
  ],
  "submission_id": "XXXXXXXXXXXXXXXXXXX",
  "created_at": "2017-06-09 09:51:23",
  "ip_address": "192.168.10.1",
  "charge": null
}
```

| Field | Meaning |
|-------|---------|
| `data` | One object per question, always present even if unanswered or hidden |
| `data[].title` | Question title, or `""` |
| `data[].description` | Question description, or `null` |
| `data[].type` | The question type (this is a question type, not an event type) |
| `data[].key` | Auto-generated pre-fill key, unique to the form |
| `data[].custom_key` | Your pre-fill key, or `null` |
| `data[].value` | The answer, or `null` |
| `submission_id` | Unique submission ID |
| `created_at` | Submission date |
| `ip_address` | Submitter's IP address |
| `charge` | Payment information if a payment was made, otherwise `null` |

Other fields may be present; inspect a real delivery (the **Test** button) to see your form's shape.

## Delivery Behaviour

- Timeout is about 10 seconds; return a success response early for slow work.
- If your URL can't be reached repeatedly, Paperform disables the webhook and emails the team
  owner and admin seats.
- Paperform doesn't record whether a delivery succeeded in the submission's webhook history.
- Paperform's help center describes resending webhooks and integration actions separately.

## Full Reference

See [Paperform's webhook documentation](https://paperform.com/help/articles/how-to-use-webhooks/).
