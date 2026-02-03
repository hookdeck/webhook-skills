# ElevenLabs Webhooks Overview

## What Are ElevenLabs Webhooks?

ElevenLabs uses webhooks to send real-time notifications about events in your account. Instead of polling their API for updates, webhooks allow ElevenLabs to push data to your application when specific events occur, primarily related to call transcription, audio processing, and call handling.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `post_call_transcription` | Call analysis and transcription completed | Save transcripts, process call insights, update call records |
| `voice_removal_notice` | Notice that voice will be removed | Notify users about upcoming removal, backup voice data |
| `voice_removal_notice_withdrawn` | Voice removal notice cancelled | Update user notifications, cancel backup processes |
| `voice_removed` | Voice has been removed from account | Clean up voice data, update UI, notify users |

## Event Payload Structure

All ElevenLabs webhook events follow this structure:

```json
{
  "type": "post_call_transcription",
  "data": {
    // Event-specific data
  },
  "event_timestamp": "2024-01-20T10:30:00Z"
}
```

### Example Payloads

**Post Call Transcription:**
```json
{
  "type": "post_call_transcription",
  "data": {
    "call_id": "clvhnqzb100016xg6vqsrwhm5",
    "agent_id": "LZPCBv5oLCMNfNeDEaRV",
    "conversation_id": "conv_12345",
    "transcript": {
      "text": "Full conversation transcript between agent and user...",
      "duration_seconds": 125,
      "turns": [
        {
          "speaker": "agent",
          "text": "Hello, how can I help you today?",
          "timestamp": "00:00:01"
        },
        {
          "speaker": "user",
          "text": "I'd like to know more about your services.",
          "timestamp": "00:00:05"
        }
      ]
    },
    "metadata": {
      "language": "en",
      "completion_status": "success"
    }
  },
  "event_timestamp": "2024-01-20T10:30:00Z"
}
```

**Voice Removal Notice:**
```json
{
  "type": "voice_removal_notice",
  "data": {
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "voice_name": "Custom Voice",
    "removal_date": "2024-02-20T00:00:00Z",
    "reason": "policy_violation"
  },
  "event_timestamp": "2024-01-20T10:30:00Z"
}
```

**Note**: The exact payload structure may vary. Please refer to [ElevenLabs documentation](https://elevenlabs.io/docs) for the most up-to-date payload schemas for each event type.

## Webhook Behavior

- **Delivery**: Webhooks are sent as HTTP POST requests to your configured endpoint
- **Timeout**: ElevenLabs expects a 200 response within 10 seconds
- **Retries**: Failed webhooks are retried with exponential backoff
- **Auto-disable**: Endpoints are disabled after 10 consecutive failures
- **Ordering**: Events may arrive out of order - use `event_timestamp` for sequencing

## Full Event Reference

For the complete list of events and their payloads, see [ElevenLabs webhook documentation](https://elevenlabs.io/docs/overview/administration/webhooks).

## Making API Calls to ElevenLabs

This skill covers **receiving** webhooks from ElevenLabs. If you also need to **send** API calls to ElevenLabs (text-to-speech, transcription, etc.), see the official [ElevenLabs Skills](https://github.com/elevenlabs/skills).

> **SDK Warning:** For JavaScript, always use `@elevenlabs/elevenlabs-js` (`npm install @elevenlabs/elevenlabs-js`). Do not use `npm install elevenlabs` - that's an outdated v1.x package.