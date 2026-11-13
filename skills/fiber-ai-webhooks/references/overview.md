# Fiber AI Webhooks Overview

## What Are Fiber AI Webhooks?

Many Fiber AI operations (batch enrichments, lookups, searches, monitoring) run in the
background. When a job finishes, Fiber AI sends a machine-readable webhook to your HTTPS
endpoint instead of making you poll. Most events also raise an in-app notification for
your team. Delivery goes through Svix: automatic retries with exponential backoff,
signed requests, a delivery-log portal and one-click replay.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `reveal.completed` | A contact reveal finishes | Store revealed emails and phone numbers |
| `batch_live_enrich.completed` | A batch live enrichment job finishes | Fetch results; read per-outcome counts |
| `batch_contact_enrich.completed` | A batch contact enrichment job finishes | Fetch enriched contacts |
| `mosaic.completed` | A file repair job finishes | Download the repaired file |
| `audience.enrichment_completed` | An audience enrichment finishes | Refresh audience data |
| `tracker.signal_detected` | A Tracker rule fires a signal | Alert sales on a buying signal |
| `job.changed` | Tracked profiles changed jobs | Trigger outreach on job changes |

Other events in the catalog:

- Enrichment: `audience.prospect_export_completed`, `audience.company_export_completed`
- Lookup: `github_to_linkedin.completed`, `github_lookup.completed`, `domain_lookup.completed`, `social_media_lookup.completed`
- Search: `saved_search.run_upcoming`, `saved_search.run_completed`, `combined_search.completed`, `google_maps_search.completed`, `local_business_search.completed`, `audience.build_completed`
- Lookup (spec only): `github_org_contributors.completed`
- Monitoring: `tracker.list_run_upcoming`, `tracker.list_run_completed` (enabled per organization), `job_changes.profiles_added`
- Monitoring (spec only): `tracker.list_baseline_completed`
- Enrichment (spec only, legacy): `batch_contact_enrich_v1.completed`

The spec-only types are in the `webhooks` section of Fiber AI's
[OpenAPI spec](https://api.fiber.ai/openapi.json) and the `createWebhookEndpoint` enum, but
not in the docs' event catalog.
- Other: `depth_chart.completed`, `sales_nav_scrape.completed`, `sales_nav_lite_scrape.completed`

## Event Payload Structure

Most completion events share one shape: `success`, an identifier (`task_id`, `run_id`,
`search_id` or `audience_id`, depending on the operation; `job_id` on
`batch_live_enrich.completed`) and `error` (set on failure).
Exceptions:

- `job.changed` has a `profiles` array (each with `listId`) and no `success` or `error`.
  New integrations should use Tracker job-change rules and `tracker.signal_detected`.
- `batch_live_enrich.completed` reports `completed` / `failed` / `not_found` / `malformed` counts instead of `error`.
- Heads-up events (`saved_search.run_upcoming`, `tracker.list_run_upcoming`, `tracker.list_run_completed`) only send `success: true`.
- Tracker signals use a richer envelope with a stable `eventId` and `occurredAt`.

Example (`reveal.completed`, from the docs page). The OpenAPI spec's schema and example name
the contact fields `email` and `number` instead of `emailAddress` and `phoneNumber`, so read
both until a real delivery shows which arrives:

```json
{
  "task_id": "abc123",
  "success": true,
  "emails": [{ "emailAddress": "jane@company.com", "type": "work" }],
  "phone_numbers": [{ "phoneNumber": "+1-555-0100", "type": "mobile" }],
  "linkedin_url": "https://www.linkedin.com/in/jane-doe"
}
```

None of the spec's example payloads includes a field naming the event, and Fiber AI names no
event header, so the delivery doesn't say which event it is. A `type` field, where present,
means something else: the saved search type (`combined`, `company_only`, `prospect_only`) on
`saved_search.run_upcoming`, and `PROFILE` or `COMPANY` on `batch_live_enrich.completed`. To
tell events apart, subscribe one endpoint per event type and name the type in its URL (the
examples read an `event` query parameter), and treat a `profiles` array as `job.changed`; use
`sendTestWebhookEvent` to see exactly what your endpoint receives.

## Delivery Behavior

- Non-2xx (3xx included) or no response within 15 seconds is a failure.
- Retries: immediate, 5s, 5min, 30min, 2h, 5h, 10h, 10h; then the message is marked failed in the portal for manual retry.
- Order is not guaranteed; order by `occurredAt` (Tracker) and dedupe on `svix-id`.
- Deliveries come from a published set of source IPs (ask Fiber AI for the list).

## Full Event Reference

See [Fiber AI's webhook documentation](https://docs.fiber.ai/monitoring/webhooks).
