# FullEnrich Webhooks Overview

## What Are FullEnrich Webhooks?

The FullEnrich Enrich API and Reverse Email Lookup are asynchronous: starting a job returns an ID immediately and results are POSTed later to a URL you supply on that request. Webhooks are **per-request callbacks**, not account-level subscriptions. There is no dashboard registration step and no event type list.

If you use Zapier, Make, Clay, or n8n, those platforms handle webhooks for you.

## Webhook Parameters

| Parameter | Fires when |
|-----------|------------|
| `webhook_url` | The entire batch is finished, lacks credits, or is canceled |
| `webhook_events.contact_finished` | Each individual contact completes, before the batch finishes |

Both can be used together: one webhook per contact plus a final batch webhook.

## Statuses (there are no event types)

The body mirrors the Get Enrichment Result response, and its `status` is the job state:

| Status | Meaning |
|--------|---------|
| `FINISHED` | Batch complete |
| `IN_PROGRESS` | Sent with each `contact_finished` webhook (single contact in `data`) |
| `CANCELED` | Batch canceled |
| `CREDITS_INSUFFICIENT` | Batch lacked credits |
| `CREATED` | Job created (listed in the API's status enum) |

## Payload Structure

```json
{
  "id": "<string>",
  "name": "My Enrichment",
  "status": "IN_PROGRESS",
  "cost": { "credits": 10 },
  "data": [
    {
      "input": { "first_name": "...", "last_name": "...", "company_domain": "..." },
      "custom": { "user_id": "12584" },
      "contact_info": {
        "most_probable_work_email": { "email": "...", "status": "DELIVERABLE" },
        "most_probable_phone": { "number": "+1 415-555-0100", "region": "US" },
        "work_emails": [], "personal_emails": [], "phones": []
      },
      "profile": { "full_name": "...", "headline": "...", "location": {}, "employment": {} }
    }
  ]
}
```

`custom` values must be strings and are returned as provided, so use them to map results to your own records.

## Delivery and Retries

Non-2xx responses are retried every minute, up to 5 times. Make handlers idempotent (for example key on `id` plus `status`, and the contact's `custom` ID).

## Full Reference

[FullEnrich: How Webhooks Work](https://docs.fullenrich.com/api/v2/general/webhooks)
