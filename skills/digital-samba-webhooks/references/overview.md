# Digital Samba Webhooks Overview

## What Are Digital Samba Webhooks?

Digital Samba is an embedded video conferencing platform. Webhooks are created through its REST API (`POST /webhooks`) with an endpoint URL and the list of `events` to receive. Digital Samba then POSTs a JSON payload to that URL when they occur. Requests are not signed. If the webhook has an `authorization_header` secret, it is sent on every request as `Authorization: Bearer <secret>`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `participant_joined` | A participant joins a room | Attendance, presence |
| `participant_left` | A participant leaves a room | Attendance, usage |
| `session_started` | A session starts | Mark a room as live |
| `session_ended` | A session ends | Billing, wrap-up |
| `recording_started` | A recording starts | Recording indicator |
| `recording_stopped` | A recording stops | Mark as processing |
| `recording_ready` | A recording is ready | Download or publish it |
| `recording_deleted` | A recording is deleted | Remove references |
| `session_summary_ready` | A session summary is ready | Send follow-ups |
| `session_transcript_ready` | A session transcript is ready | Index or archive |

Other event types listed in the documentation: `file_added_to_library`, `file_renamed`, `file_deleted_from_library`, `file_processing_failed`, `folder_added_to_library`, `folder_renamed`, `folder_deleted_from_library`, `phone_participant_muted`, `phone_participant_unmuted`, `phone_participant_asked_to_unmute`, `participant_invited`, `participant_avatar_uploaded`, `participant_avatar_deleted`, `participant_hand_raised`, `participant_hand_lowered`, `participant_waiting_joined`, `participant_waiting_left`, `question_asked`, `question_answered`, `question_updated`, `question_dismissed`, `question_reopened`, `question_deleted`, `answer_updated`, `answer_deleted`, `room_locked`, `room_unlocked`, `room_deleted`, `role_deleted`.

## Event Payload Structure

```json
{
  "eventType": "participant_joined",
  "sessionId": "4fcc375c-e0ce-4f52-9b35-3a034042ab5a",
  "roomId": "7f8c8eac-6643-47db-8d93-e7633e6e53ec",
  "timestamp": 1675790387,
  "data": {
    "participantId": "8b085f23-9a2a-465d-bdbb-73a233c7df90",
    "name": "John Smith",
    "role": "moderator"
  }
}
```

- `eventType` - the event type; dispatch on this
- `sessionId`, `roomId` - the session and room the event belongs to
- `timestamp` - Unix seconds
- `data` - event-specific fields

## Full Event Reference

See [Digital Samba's webhook documentation](https://docs.digitalsamba.com/reference/rest-api/webhooks).
