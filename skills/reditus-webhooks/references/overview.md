# Reditus Webhooks Overview

## What Are Reditus Webhooks?

Reditus (getreditus.com) is affiliate and referral program software for B2B SaaS. Its webhooks push events from both programs to your endpoint so your system can react without polling the API: Slack alerts, emails to an advocate, a Stripe discount for a lead, and so on. Each request is signed with an `X-Signature` header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `partnership.accepted` | An affiliate partnership is accepted | Activate the affiliate, notify your team |
| `referral.created` | A referral is created (affiliate program) | Record the referral, post to Slack |
| `advocate.created` | An advocate is created (referral program) | Email the advocate their referral link |
| `lead.created` | A lead is created | Generate a Stripe discount, attribute the lead |
| `reward.created` | A reward is generated | Grant the reward, post to Slack |

These five are the events in Reditus's webhook docs.

## Event Payload Structure

Every event has the same envelope; only `data` differs:

```json
{
  "event_type": "partnership.accepted",
  "url": "destination-url@example.com",
  "created_at": "2024-05-05",
  "data": {
    "affiliate_name": "Acme",
    "affiliate_email": "john@acme.com",
    "affiliate_first_name": "John",
    "affiliate_last_name": "Doe",
    "accepted_at": "2024-05-05"
  }
}
```

`url` is the destination (the docs' samples show a placeholder) and `created_at` is a date.

`data` fields in the docs' examples:

| Event | `data` fields |
|-------|---------------|
| `partnership.accepted` | `affiliate_name`, `affiliate_email`, `affiliate_first_name`, `affiliate_last_name`, `accepted_at` |
| `referral.created` | `affiliate_email`, `referral_id`, `referral_uid` (your internal ID), `referral_email` |
| `advocate.created` | `advocate_uid` (your internal ID), `advocate_id`, `advocate_slug`, `advocate_referral_link`, `advocate_first_name`, `advocate_last_name`, `advocate_email`, `advocate_company`, `advocate_company_id` |
| `lead.created` | `advocate_uid`, `lead_id`, `lead_uid` (your internal ID), `lead_email` |
| `reward.created` | `amount` (sample 5521 = $55.21, so minor units), `currency`, `advocate_uid`, `lead_id`, `reward_id`, `custom_text` (only with custom reward triggers) |

Treat every field as untrusted and check its type before use.

## Delivery

Reditus's docs say nothing about retries, timeouts, the expected response or the HTTP method. Respond `2xx` quickly and make handlers idempotent.

## Full Event Reference

See [Reditus's webhook documentation](https://docs.getreditus.com/webhooks/get_started) and the per-event pages linked from [llms.txt](https://docs.getreditus.com/llms.txt).
