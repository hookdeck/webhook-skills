# TheirStack Webhooks Overview

## What Are TheirStack Webhooks?

TheirStack (job and technographic data) sends an HTTP POST with a JSON body to your URL when something changes for a **saved search**: a new job is found, a company matches for the first time, a job closes, or a company adopts a technology. Webhooks are tied to a saved job search or company search, and a job webhook cannot be switched to a company search (or the reverse). Typical targets are n8n, Zapier, Make, Airtable, Slack, a CRM, or your own endpoint.

Each delivery contains **one record**.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `job.new` | A new job posting matching your search is discovered | Sales alerts, lead creation, hiring-signal tracking |
| `company.new` | A company matches your search for the first time (never again for that webhook) | Add leads to a CRM, enrichment |
| `job.closed` | A matching job is closed or removed by the source | Mark roles as filled or expired |
| `tech.new` | A company adopts a new technology (request access) | Technographic change alerts |

## Event Payload Structure

The event name is in the body, not a header:

```json
{ "id": 123, "type": "job.new", "payload": { "id": 456, "job_title": "Senior Data Engineer", "company_domain": "acme.com" } }
```

- `type`: `job.new`, `company.new`, `job.closed` (and `tech.new`)
- `payload` for `job.new`: the full Job record
- `payload` for `company.new`: the full Company record
- `payload` for `job.closed`: minimal, `{ "id": 123, "closed_at": "2026-06-08T14:00:00Z" }`

Deduplicate jobs on the record `id`; the same job can arrive twice if two webhooks listen to overlapping searches.

## Delivery Rules

- Respond with 2xx to acknowledge. Failed events are retried every hour for 48 hours.
- Endpoints must handle at least 2 concurrent requests.
- Billing: `job.new` and `job.closed` use 1 API credit, `company.new` and `tech.new` use 3. A daily event limit can be set on each webhook.

## Full Event Reference

For the complete schemas, see [TheirStack's webhook documentation](https://theirstack.com/en/docs/webhooks).
