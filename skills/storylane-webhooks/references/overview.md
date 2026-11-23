# Storylane Webhooks Overview

## What Are Storylane Webhooks?

Storylane (storylane.io) builds interactive product demos. A demo alert (Settings > Alerts) can post
to a webhook URL when a demo session is viewed, with the session, lead and buyer-reveal data.
Webhooks are available on the Starter plan and above. Storylane's docs don't describe timeouts or
retries; a **Test webhook** button sends a sample delivery. RepX, Storylane's AI demo agent, has its
own webhook (RepX dashboard, **Settings > Integrations**) that posts each completed conversation.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `demo_viewed` | A demo session matches a demo alert | Push leads to a CRM or Slack, score intent, enrich accounts |
| `repx_conversation_completed` | A RepX conversation completes | Log transcripts and summaries, route qualified leads |

Dispatch on the top-level `event` field. `demo_viewed` is the only demo alert value documented.
RepX's field table names `message_count` but its sample prints `messages_count`; read both.

## Event Payload Structure

```json
{
  "id": "a61a8af4-8a33-4b4d-9861-d8542bcb4d36",
  "analytics_url": "https://app.storylane.io/audience/sessions/a61a8af4-...",
  "buyer_reveal": { "company_name": "Acme Inc", "company_domain": "example.com", "confidence_score": "low" },
  "checklist_completed": false,
  "completion": 100,
  "cta_opened": null,
  "host_url": "https://app.storylane.io/share/lcmplr8qd0rj",
  "intent_level": "high",
  "lead": { "id": "dcc7997a-...", "email": "user1@example.com", "first_name": "", "last_name": "", "lead_source": "Nurtured" },
  "link": "https://app.storylane.io/share/lcmplr8qd0rj",
  "link_name": "Default",
  "location": { "city": "Pune", "country": "India", "state": "MH" },
  "name": "test for Pardot",
  "referers": ["https://app.storylane.io/share/lcmplr8qd0rj?email=user1@example.com"],
  "time_spent": 10,
  "utm_params": {},
  "viewed_at": "2026-05-20T03:27:29.246-07:00",
  "event": "demo_viewed"
}
```

`lead` is an object for a known visitor and `null` for an unknown one. `id` is the session id:
upsert on it. The email above is a placeholder for the value in Storylane's example.

## Full Event Reference

See [Storylane's webhook documentation](https://docs.storylane.io/integrations-demo-suite/integrations-and-data-flow/webhooks)
and the [RepX webhook page](https://docs.storylane.io/repx-chat/webhooks).
