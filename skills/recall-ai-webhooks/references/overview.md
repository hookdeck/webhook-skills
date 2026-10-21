# Recall.ai Webhooks Overview

## What Are Recall.ai Webhooks?

Recall.ai runs meeting bots (Zoom, Google Meet, Microsoft Teams and others) and a Desktop Recording SDK. It pushes data to your server in two ways:

| Delivery | What it carries | Where you configure it | Retries |
|----------|-----------------|------------------------|---------|
| **Svix webhooks** | Bot status changes, recording and media artifact status, Calendar V2 changes | Webhooks dashboard in your region (subscribe to each event) | Svix schedule: immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h |
| **Real-time webhook endpoints** | In-call participant events and transcript data | Per bot, in `recording_config.realtime_endpoints` on Create Bot | Up to 60 attempts, 1 second apart |

Both are signed with the same Standard Webhooks scheme (see [verification.md](verification.md)), and both use the same JSON envelope:

```json
{
  "event": "bot.done",
  "data": { ... }
}
```

The event name is in the top-level **`event`** field (not `type`).

## Common Event Types

### Bot status change (Svix)

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `bot.joining_call` | Bot acknowledged the join request and is connecting (can repeat on join retries) | Show "joining" in your UI |
| `bot.in_waiting_room` | Bot is in the meeting's waiting room | Prompt the host to admit the bot |
| `bot.in_call_not_recording` | Bot is in the meeting but not recording yet | Show "in call" state |
| `bot.recording_permission_allowed` | Host allowed the bot to record | Track consent |
| `bot.recording_permission_denied` | Host denied recording (see `data.data.sub_code`) | Alert the user |
| `bot.in_call_recording` | Bot is recording audio and video | Show "recording" state |
| `bot.call_ended` | Bot left the call (`data.data.sub_code` says why); media may not be ready | Update meeting state |
| `bot.done` | Bot shut down; media is uploaded if it recorded | Download media, start processing |
| `bot.fatal` | Bot hit an error and shut down (`data.data.sub_code` says why) | Alert, retry scheduling |
| `bot.breakout_room_entered` / `bot.breakout_room_left` | Bot entered or left a breakout room | Track room context |
| `bot.breakout_room_opened` / `bot.breakout_room_closed` | A breakout room opened or closed | Track room context |

Payload:

```json
{
  "event": "bot.call_ended",
  "data": {
    "data": { "code": "call_ended", "sub_code": "call_ended_by_host", "updated_at": "2026-10-21T12:00:00.000Z" },
    "bot": { "id": "8b6e2f6a-...", "metadata": {} }
  }
}
```

Don't treat `code` or `sub_code` as closed enums; Recall.ai may add values.

### Recording and media artifacts (Svix)

Each artifact has `.processing`, `.done`, `.failed` and `.deleted` events:

| Artifact | Events |
|----------|--------|
| Recording | `recording.processing`, `recording.done`, `recording.failed`, `recording.deleted` |
| Transcript | `transcript.processing`, `transcript.done`, `transcript.failed`, `transcript.deleted` |
| Mixed audio | `audio_mixed.processing`, `audio_mixed.done`, `audio_mixed.failed`, `audio_mixed.deleted` |
| Separate audio | `audio_separate.processing`, `audio_separate.done`, `audio_separate.failed`, `audio_separate.deleted` |
| Mixed video | `video_mixed.processing`, `video_mixed.done`, `video_mixed.failed`, `video_mixed.deleted` |
| Separate video | `video_separate.processing`, `video_separate.done`, `video_separate.failed`, `video_separate.deleted` |
| Participant events | `participant_events.processing`, `participant_events.done`, `participant_events.failed`, `participant_events.deleted` |
| Meeting metadata | `meeting_metadata.processing`, `meeting_metadata.done`, `meeting_metadata.failed`, `meeting_metadata.deleted` |

Payload (transcript example): `data.data` holds `code`, `sub_code` and `updated_at`, plus `data.transcript`, `data.recording` and `data.bot` objects, each with `id` and `metadata`.

### Calendar V2 (Svix)

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `calendar.update` | A calendar's data changed (for example `status` became `disconnected`). Payload: `data.calendar_id` | Re-fetch the calendar, prompt the user to reconnect |
| `calendar.sync_events` | Events on a calendar were created, updated or deleted. Payload: `data.calendar_id`, `data.last_updated_ts` | List calendar events with `updated_at__gte=last_updated_ts`, schedule or delete bots |

### Real-time endpoint events

| Event | Triggered When |
|-------|----------------|
| `participant_events.join` / `participant_events.leave` | A participant joined or left |
| `participant_events.update` | A participant updated their details |
| `participant_events.speech_on` / `participant_events.speech_off` | A participant started or stopped speaking |
| `participant_events.webcam_on` / `participant_events.webcam_off` | Webcam toggled |
| `participant_events.screenshare_on` / `participant_events.screenshare_off` | Screen share toggled |
| `participant_events.chat_message` | A participant sent a chat message (`data.data.data.text`) |
| `transcript.data` | A transcript utterance was generated |
| `transcript.partial_data` | A partial utterance was generated |
| `transcript.provider_data` | Raw data from the transcription provider |

Participant event payloads put the participant at `data.data.participant` and include `data.realtime_endpoint`, `data.participant_events`, `data.recording` and `data.bot`.

## Delivery Behaviour

- Return a `2xx` quickly. Bot webhooks time out after 15 seconds and the timeout can't be raised, so do slow work asynchronously.
- Svix endpoints are disabled after 5 days of consistent failures; re-enable them in the dashboard and use **Recover failed messages** to replay.
- Real-time endpoint events can't be replayed once their 60 retries are used up.
- Custom query parameters on your URL (e.g. `?env=staging`) are passed through.

## Full Event Reference

- [Webhooks overview](https://docs.recall.ai/reference/webhooks-overview)
- [Bot status change events](https://docs.recall.ai/docs/bot-status-change-events)
- [Recording webhooks](https://docs.recall.ai/docs/recording-webhooks)
- [Calendar V2 webhooks](https://docs.recall.ai/docs/calendar-v2-webhooks)
- [Real-time webhook endpoints](https://docs.recall.ai/docs/real-time-webhook-endpoints) and [payloads](https://docs.recall.ai/docs/real-time-event-payloads)
