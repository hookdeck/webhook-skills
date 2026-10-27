# Meeting BaaS Webhooks Overview

## What Are Meeting BaaS Webhooks?

[Meeting BaaS](https://meetingbaas.com) is a meeting-recording bot API for Zoom, Google Meet and
Microsoft Teams. In API v2 it sends an HTTPS `POST` to the endpoints you configure in your account
settings when a bot changes state, finishes, posts chat or fails, and when a connected calendar
syncs or changes. Deliveries go through Svix and are signed (see [verification.md](verification.md)).

> Only Meeting BaaS v2 account-level webhooks are supported. Per-bot callbacks and v1 API webhooks aren't signed this way and fail verification.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Only `2xx`. Redirects (3xx), 4xx and 5xx are all retried |
| Timeout | 30 seconds |
| Delivery | At-least-once, generally in order but not guaranteed. Deduplicate on `svix-id` |

## Webhooks vs Per-Bot Callbacks

| | Account-level webhooks | Per-bot callbacks |
|---|---|---|
| Configured | In account settings (not via the API) | `callback_config` when creating a bot |
| Sent via | Svix, signed | Direct HTTP `POST` or `PUT`, unsigned |
| Events | All bot and calendar events for every bot | Only `bot.completed` and `bot.failed` |
| Auth | `svix-*` signature | Optional `x-mb-secret` header carrying your own secret |

This skill covers the first column only. Callbacks use the same payload shape but aren't Svix
signed, so the verification here fails on them.

## Event Payload Structure

Every event arrives as `{event, data}`:

```json
{
  "event": "bot.completed",
  "data": {
    "bot_id": "123e4567-e89b-12d3-a456-426614174000",
    "event_id": "789e0123-e45b-67c8-d901-234567890abc",
    "transcription": "https://s3.amazonaws.com/.../transcription.json",
    "mp4": "https://s3.amazonaws.com/.../video.mp4",
    "audio": "https://s3.amazonaws.com/.../audio.mp3",
    "diarization": "https://s3.amazonaws.com/.../diarization.jsonl",
    "chat_messages": "https://s3.amazonaws.com/.../chat_messages.json",
    "duration_seconds": 3600,
    "participants": [],
    "speakers": [],
    "extra": { "customer_id": "12345" }
  }
}
```

| Field | Meaning |
|-------|---------|
| `event` | The event name. Branch on this |
| `data` | The event payload |
| `data.bot_id` | The bot (bot events) |
| `data.event_id` | Bot events carry an `event_id` in `data` |
| `data.extra` | Echoes the `extra` object you set when creating the bot |
| `extra` (top level) | Where `bot.chat_message` puts it: beside `data`, not inside |

Calendar payloads are keyed by `data.calendar_id`. Calendar event payloads also have a `data.event_id`
inside each instance, which is the calendar event, not a webhook event id.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `bot.status_change` | A bot's status changes. `data.status.code` is the new status, with `created_at`, `start_time` (only on `in_call_recording`) and `error_message` on failures | Track bot progress, update UI |
| `bot.completed` | A bot finished recording and processing. Carries `transcription`, `mp4`, `audio`, `diarization`, `chat_messages` URLs, `duration_seconds`, `participants`, `speakers` | Download recordings, post-meeting workflows |
| `bot.chat_message` | A participant posts in the meeting chat. `message_id`, `sender_name`, `sender_id` (may be null), `text`, `sent_at` (when the webhook was dispatched) | Chat integrations, compliance logging |
| `bot.failed` | A bot failed. `error_code` (e.g. `BOT_NOT_ACCEPTED`, `TIMEOUT_WAITING_TO_START`, `INSUFFICIENT_TOKENS`, `DAILY_BOT_CAP_REACHED`, `INVALID_MEETING_PLATFORM`, `TRANSCRIPTION_ERROR`) and `error_message` | Error handling, retry bot creation |
| `calendar.connection_created` | A calendar connection was created (`platform`, `account_email`, `calendar_name`) | Confirm the integration |
| `calendar.connection_updated` | A connection was updated, e.g. credentials refreshed (`status`) | Monitor connection health |
| `calendar.connection_deleted` | A connection was deleted | Clean up calendar data |
| `calendar.connection_error` | A connection hit an error, e.g. OAuth refresh failed (`error`, `status`) | Alert the user, reconnect |
| `calendar.events_synced` | A calendar sync finished, when it syncs for the first time (`events_synced`, `sync_type`) | Process newly synced events |
| `calendar.event_created` | A new event in a connected calendar (`event_type`, `series_id`, `series_bot_scheduled`, `instances`) | Schedule bots for new events |
| `calendar.event_updated` | An event changed (`affected_instances`) | Update bot schedules |
| `calendar.event_cancelled` | An event was cancelled (`cancelled_instances`) | Cancel scheduled bots |

The examples handle exactly these 12 events and acknowledge anything else with `200`. The docs
describe the list as the set of webhook types, but don't promise it won't grow.

### Bot status codes

`data.status.code` on `bot.status_change` can be any of: `queued`, `pickup_delayed`, `transcribing`,
`completed`, `failed`, `joining_call`, `in_waiting_room`, `in_waiting_for_host` (Zoom only),
`in_call_not_recording`, `in_call_recording`, `recording_paused`, `recording_resumed`, `call_ended`,
`recording_succeeded`, `recording_failed`, and the Google Meet / Teams signals `api_request_stop`,
`bot_rejected`, `bot_removed`, `bot_removed_too_early`, `waiting_room_timeout`, `invalid_meeting_url`,
`meeting_error`. If you only need outcomes, use `bot.completed` and `bot.failed`.

## Delivery Rules Worth Planning For

- **Retries.** Failed deliveries are retried 7 attempts in total, at 0, 5 s, 10 s, 5 min, 15 min,
  30 min and 2 h (about 3 hours, each with ±20% jitter). This is kept inside the 4-hour validity of
  the presigned URLs in `bot.completed`. A `429` or a timeout adds a minimum 60 s delay.
- **Artifact URLs expire.** `bot.completed` URLs are valid for 4 hours: download them promptly.
- **Out-of-order delivery** can happen on retries. Don't assume `bot.completed` follows the last `bot.status_change`.
- **Auto-disable.** An endpoint that fails every delivery for 5 days is disabled, and later messages
  are dropped until you re-enable it in the dashboard. A single success resets the clock.
- **Resend.** `POST /v2/bots/:bot_id/resend-webhook` re-sends a bot's webhook.
- **Bot's own chat is not delivered.** `bot.chat_message` covers participants only. The
  `chat_messages` artifact in `bot.completed` has everything.

## Full Event Reference

See Meeting BaaS's [webhooks documentation](https://docs.meetingbaas.com/api-v2/webhooks) and
[setting up webhooks](https://docs.meetingbaas.com/api-v2/getting-started/webhooks).
