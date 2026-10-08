# Deepgram Webhooks Overview

## What Are Deepgram Webhooks?

Deepgram webhooks (called "callbacks" in their documentation) enable asynchronous processing of audio transcription requests. Instead of waiting for transcription to complete, you receive an immediate response with a `request_id`, and Deepgram sends the transcription results to your webhook URL when processing is finished.

## How Callbacks Work

1. **Submit Request**: Send audio to Deepgram API with a `callback` parameter
2. **Immediate Response**: Receive a `request_id` immediately
3. **Asynchronous Processing**: Deepgram processes your audio
4. **Webhook Delivery**: Transcription results are POSTed to your callback URL (or PUT, with `callback_method=put`)

## Common Use Cases

| Use Case | Description | Benefits |
|----------|-------------|----------|
| Large File Processing | Transcribe lengthy audio/video files | No timeout issues, better resource management |
| Batch Processing | Process multiple files concurrently | Higher throughput, parallel processing |
| Queue-Based Systems | Integrate with job queues | Decouple submission from processing |
| Real-time Notifications | Get notified when transcriptions complete | Update UI, trigger downstream processes |
| Resilient Architecture | Handle network interruptions gracefully | Automatic retries, guaranteed delivery |

## Webhook Payload Structure

The callback body is the same response a synchronous `/v1/listen` request returns: a `metadata` object and a `results` object. There is no top-level `request_id` and no event-type field; the request ID lives in `metadata.request_id`. This example is the pre-recorded response from Deepgram's [API reference](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded) (trimmed to two words):

```json
{
  "metadata": {
    "request_id": "a847f427-4ad5-4d67-9b95-db801e58251c",
    "sha256": "154e291ecfa8be6ab8343560bcc109008fa7853eb5372533e8efdefc9b504c33",
    "created": "2024-05-12T18:57:13.426Z",
    "duration": 25.933313,
    "channels": 1,
    "models": [
      "30089e05-99d1-4376-b32e-c263170674af"
    ],
    "model_info": {
      "30089e05-99d1-4376-b32e-c263170674af": {
        "name": "2-general-nova",
        "version": "2024-01-09.29447",
        "arch": "nova-2"
      }
    }
  },
  "results": {
    "channels": [
      {
        "alternatives": [
          {
            "transcript": "Yeah, as as much as, it's worth having a talk to the neighbors.",
            "confidence": 0.9840088,
            "words": [
              { "word": "yeah", "start": 0.08, "end": 0.32, "confidence": 0.9975586 },
              { "word": "as", "start": 0.32, "end": 0.48, "confidence": 0.9862061 }
            ]
          }
        ]
      }
    ]
  }
}
```

If you pass `extra=KEY:VALUE` on the request, the pairs come back in `metadata.extra` (for example `"extra": { "job_id": "4821" }`).

## Features Available in Callbacks

All transcription features work with callbacks:

- **Punctuation**: Automatic punctuation insertion
- **Diarization**: Speaker identification
- **Word Timings**: Start/end times for each word
- **Language Detection**: Automatic language identification
- **Custom Vocabulary**: Domain-specific terms
- **Profanity Filtering**: Content moderation
- **Smart Formatting**: Numbers, dates, times formatting

## Callback vs Synchronous Requests

| Aspect | Synchronous | Callback (Webhook) |
|--------|-------------|-------------------|
| Response Time | Waits for completion | Immediate request_id |
| Timeout Risk | Yes, for long files | No |
| Resource Usage | Connection held open | Connection released immediately |
| Retry Logic | Client implements | Deepgram handles (10 retries) |
| Best For | Short audio (<60s) | Long audio, batch processing |

## Full Documentation

For complete details on all transcription features and options, see [Deepgram's API documentation](https://developers.deepgram.com/reference).