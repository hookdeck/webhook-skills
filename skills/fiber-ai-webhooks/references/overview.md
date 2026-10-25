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
- Monitoring: `tracker.list_run_upcoming`, `tracker.list_run_completed` (enabled per organization), `job_changes.profiles_added`
- Other: `depth_chart.completed`, `sales_nav_scrape.completed`, `sales_nav_lite_scrape.completed`

## Event Payload Structure

Most completion events share one shape: `success`, an identifier (`task_id`, `run_id`,
`search_id` or `audience_id`, depending on the operation) and `error` (set on failure).
Exceptions:

- `job.changed` has a `profiles` array (each with `listId`) and no `success` or `error`.
  New integrations should use Tracker job-change rules and `tracker.signal_detected`.
- `batch_live_enrich.completed` reports `completed` / `failed` / `not_found` / `malformed` counts instead of `error`.
- Heads-up events (`saved_search.run_upcoming`, `tracker.list_run_upcoming`, `tracker.list_run_completed`) only send `success: true`.
- Tracker signals use a richer envelope with a stable `eventId` and `occurredAt`.

Example (`reveal.completed`):

```json
{
  "task_id": "abc123",
  "success": true,
  "emails": [{ "emailAddress": "jane@company.com", "type": "work" }],
  "phone_numbers": [{ "phoneNumber": "+1-555-0100", "type": "mobile" }],
  "linkedin_url": "https://www.linkedin.com/in/jane-doe"
}
```

The docs' example payloads do not include a `type` field, and Fiber AI names no event header,
so the event type isn't documented anywhere in the delivery. To tell events apart, subscribe
one endpoint per event type and route by URL, or compare deliveries with the `examplePayload`
that `listWebhookEventTypes` returns for each type. The example handlers read a `type` field
only defensively, if one is present, and treat a `profiles` array as `job.changed`; use
`sendTestWebhookEvent` to see exactly what your endpoint receives.

## Delivery Behavior

- Non-2xx (3xx included) or no response within 15 seconds is a failure.
- Retries: immediate, 5s, 5min, 30min, 2h, 5h, 10h, 10h; then the message is marked failed in the portal for manual retry.
- Order is not guaranteed; order by `occurredAt` (Tracker) and dedupe on `svix-id`.
- Deliveries come from a published set of source IPs (ask Fiber AI for the list).

## Full Event Reference

See [Fiber AI's webhook documentation](https://docs.fiber.ai/monitoring/webhooks).
