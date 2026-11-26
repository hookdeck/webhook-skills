# ElevenLabs Webhooks Overview

## What Are ElevenLabs Webhooks?

ElevenLabs uses webhooks to send real-time notifications about events in your account. Instead of polling their API for updates, webhooks allow ElevenLabs to push data to your application when specific events occur, such as finished agent calls, voice removals and completed speech-to-text or image and video jobs.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `post_call_transcription` | An agent call ends and analysis is complete | Save transcripts, update CRM records |
| `post_call_audio` | The call's full audio is ready (base64-encoded MP3) | Archive recordings |
| `call_initiation_failure` | An agent phone call fails to connect | Retry or mark the lead |
| `voice_removal_notice` | A shared Voice Library voice is scheduled for removal | Switch voices before `future_removal_timestamp` |
| `voice_removal_notice_withdrawn` | A scheduled removal is cancelled | Keep using the voice |
| `voice_removed` | A shared voice is removed without a notice period | Switch voices now |
| `speech_to_text_transcription` | An async transcription requested with `webhook=true` completes | Store the transcript |
| `webhook_error` | That transcription fails | Log the error, retry |
| `flows_generation` | An image or video generation completes or fails | Download the result |
| `flows_template_run` | A template run completes or fails | Read the run's outputs |
| `convai_alerting_notification` | An agent monitoring alert triggers or resolves | Page the on-call team |

## Event Payload Structure

Most events follow this structure, with `event_timestamp` in unix seconds:

```json
{
  "type": "voice_removal_notice_withdrawn",
  "event_timestamp": 1739537297,
  "data": {
    "voice_id": "21m00Tcm4TlvDq8ikWAM"
  }
}
```

`webhook_error` and `convai_alerting_notification` have no `data` object; their fields are at the top level.

### Example Payloads (from the ElevenLabs docs)

**Voice Removal Notice:**
```json
{
  "type": "voice_removal_notice",
  "event_timestamp": 1739537297,
  "data": {
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "future_removal_timestamp": 1742129297,
    "suggested_voices": [
      [
        "https://elevenlabs.io/app/voice-lab/share/a1b2c3d4e5f6/EXAVITQu4vr4xnSDxMaL",
        "Sarah"
      ]
    ]
  }
}
```

**Call Initiation Failure (SIP):**
```json
{
  "type": "call_initiation_failure",
  "event_timestamp": 1759931652,
  "data": {
    "agent_id": "xyz",
    "conversation_id": "abc",
    "failure_reason": "busy",
    "metadata": {
      "type": "sip",
      "body": {
        "from_number": "+441111111111",
        "to_number": "+11111111111",
        "sip_status_code": 486,
        "error_reason": "INVITE failed: sip status: 486: Busy here (SIP 486)",
        "call_sid": "d8e7f6a5-b4c3-4d5e-8f9a-0b1c2d3e4f5a",
        "sip_status": "Busy here",
        "twirp_code": "unavailable"
      }
    }
  }
}
```

For `post_call_transcription`, see the full example in [Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks#example-webhook-payloads). Its `data` carries `agent_id`, `conversation_id`, `status`, `transcript` (a list of turns with `role` and `message`), `metadata` and `analysis`.

## Webhook Behavior

- **Delivery**: HTTPS POST with a JSON body. Audio webhooks are streamed with `transfer-encoding: chunked` and time out after 5 minutes.
- **Success**: return a 200 promptly. ElevenLabs doesn't publish a timeout for other webhooks.
- **Retries**: off by default. When enabled on the webhook, a 5xx, 408, 429 or connection error is retried up to 5 times (immediately, then after 30 seconds, 2 minutes, 8 minutes and 30 minutes). Other 4xx responses are not retried.
- **Duplicates**: a retry has the same body and the same `ElevenLabs-Webhook-Delivery-Id` header. Post-call events for one conversation share `conversation_id`, so key on `type` plus `conversation_id` or on the delivery ID.
- **Auto-disable**: after 10 or more consecutive failures, if the last successful delivery was more than 7 days ago or there never was one. Workspace admins get an email, and the webhook must be re-enabled by hand.
- **Ordering**: not documented. Audio and transcription webhooks are delivered separately.

## Full Event Reference

See the [ElevenLabs Webhooks documentation](https://elevenlabs.io/docs/eleven-api/resources/webhooks) and [Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks).

## Making API Calls to ElevenLabs

This skill covers **receiving** webhooks from ElevenLabs. If you also need to **send** API calls to ElevenLabs (text-to-speech, transcription, etc.), see the official [ElevenLabs Skills](https://github.com/elevenlabs/skills).

> **SDK Warning:** For JavaScript, always use `@elevenlabs/elevenlabs-js` (`npm install @elevenlabs/elevenlabs-js`). Do not use `npm install elevenlabs` - that's an outdated v1.x package.