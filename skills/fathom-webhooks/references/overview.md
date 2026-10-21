# Fathom Webhooks Overview

## What Are Fathom Webhooks?

[Fathom](https://fathom.video) is an AI meeting notetaker that records, transcribes
and summarizes Zoom, Google Meet, Microsoft Teams and Slack huddle calls. Its
webhooks send a meeting's data to a URL of your choice once the meeting's content
is ready, optionally including the summary, transcript, action items and CRM matches.

Do not confuse it with **Fathom Analytics** (usefathom.com), an unrelated
website-analytics product.

## When Do Fathom Webhooks Fire?

- Once per new meeting, when the recording finalizes. This is the same event that
  triggers the post-call summary email.
- **No summary, no webhook.** Short or silent test calls that don't produce a
  summary don't fire one.
- Only for recordings that match the webhook's `triggered_for` scopes (see
  [setup.md](setup.md)). Visibility is evaluated when the call finalizes, and
  changing it afterward does not re-fire the webhook.
- Never re-sent when a transcript, summary or visibility changes later. Poll the
  API if you need updates.
- Fathom doesn't publish a guaranteed delivery window.

## Event Types

Fathom has a single webhook type:

| Webhook | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| New meeting content ready | A recorded meeting has finalized and its content is ready | Push summaries to Slack or a CRM, create tasks from action items, archive transcripts |

There is **no event-type field** in the payload or headers. Don't write a
`switch (event.type)`. Every delivery is a Meeting object.

## Event Payload Structure

```json
{
  "title": "Quarterly Business Review",
  "meeting_title": "QBR 2025 Q1",
  "meeting_type": "Quarterly Business Review",
  "recording_id": 123456789,
  "url": "https://fathom.video/xyz123",
  "share_url": "https://fathom.video/share/xyz123",
  "meeting_url": "https://us02web.zoom.us/j/123456789",
  "created_at": "2025-03-01T17:01:30Z",
  "scheduled_start_time": "2025-03-01T16:00:00Z",
  "scheduled_end_time": "2025-03-01T17:00:00Z",
  "recording_start_time": "2025-03-01T16:01:12Z",
  "recording_end_time": "2025-03-01T17:00:55Z",
  "calendar_invitees_domains_type": "one_or_more_external",
  "shared_with": "single_team",
  "transcript_language": "en",
  "recorded_by": {
    "name": "Alice Johnson",
    "email": "alice.johnson@acme.com",
    "email_domain": "acme.com",
    "team": "Marketing"
  },
  "calendar_invitees": [
    { "name": "Alice Johnson", "email": "alice.johnson@acme.com", "email_domain": "acme.com", "is_external": false }
  ],
  "default_summary": {
    "template_name": "general",
    "markdown_formatted": "## Summary\nWe reviewed Q1 OKRs..."
  },
  "transcript": [
    { "speaker": { "display_name": "Alice Johnson", "matched_calendar_invitee_email": "alice.johnson@acme.com" },
      "text": "Let's revisit the budget allocations.", "timestamp": "00:05:32" }
  ],
  "action_items": [
    { "description": "Email revised proposal to client", "user_generated": false, "completed": false,
      "recording_timestamp": "00:10:45", "recording_playback_url": "https://fathom.video/calls/xyz123?timestamp=645",
      "assignee": { "name": "Alice Johnson", "email": "alice.johnson@acme.com", "team": "Marketing" } }
  ],
  "crm_matches": { "contacts": [], "companies": [], "deals": [], "error": null }
}
```

Key points:

- `transcript`, `default_summary`, `action_items` and `crm_matches` are only populated
  when the matching `include_*` option is enabled. Treat them as optional/nullable.
- `default_summary.markdown_formatted` is Markdown, generated from your account's
  default summary template. Summary and action-item text is always in English.
- `transcript[].timestamp` and `action_items[].recording_timestamp` are `HH:MM:SS`
  offsets from the start of the recording.
- The payload does **not** identify which user's API key owns the webhook. If you
  receive webhooks for several users, give each user their own destination URL.
- The webhook's own ID (returned at creation) is not in the payload. The
  per-delivery `webhook-id` header is a different value.

## Delivery and Retries

- Respond with a 2xx quickly. Non-2xx responses and timeouts may be retried. Fathom
  doesn't publish the retry schedule or attempt count.
- Retries keep the same `webhook-id` header, so use it to deduplicate.
- You can't manually re-send a delivery. Retries are the only way a delivery
  repeats.
- Custom outgoing headers aren't supported.

## Full Event Reference

- [Fathom webhooks guide](https://developers.fathom.ai/webhooks)
- [New meeting content ready payload](https://developers.fathom.ai/api-reference/webhook-payloads/new-meeting-content-ready)
