# Deepgram Webhooks Overview

## What Are Deepgram Webhooks?

Deepgram webhooks (called "callbacks" in their documentation) enable asynchronous processing of audio transcription requests. Instead of waiting for transcription to complete, you receive an immediate response with a `request_id`, and Deepgram sends the transcription results to your webhook URL when processing is finished.

## How Callbacks Work

1. **Submit Request**: Send audio to Deepgram API with a `callback` parameter
2. **Immediate Response**: Receive a `request_id` immediately
3. **Asynchronous Processing**: Deepgram processes your audio
4. **Webhook Delivery**: Transcription results are POSTed to your callback URL

## Common Use Cases

| Use Case | Description | Benefits |
|----------|-------------|----------|
| Large File Processing | Transcribe lengthy audio/video files | No timeout issues, better resource management |
| Batch Processing | Process multiple files concurrently | Higher throughput, parallel processing |
| Queue-Based Systems | Integrate with job queues | Decouple submission from processing |
| Real-time Notifications | Get notified when transcriptions complete | Update UI, trigger downstream processes |
| Resilient Architecture | Handle network interruptions gracefully | Automatic retries, guaranteed delivery |

## Webhook Payload Structure

The webhook payload contains the complete transcription response:

```json
{
  "request_id": "uuid-string",
  "created": "2024-01-20T10:30:00.000Z",
  "duration": 120.5,
  "channels": 1,
  "model_info": {
    "name": "general",
    "version": "2024-01-09.29447",
    "arch": "nova-2"
  },
  "results": {
    "channels": [
      {
        "alternatives": [
          {
            "transcript": "Your transcribed text appears here...",
            "confidence": 0.98765,
            "words": [
              {
                "word": "Your",
                "start": 0.0,
                "end": 0.24,
                "confidence": 0.99
              }
              // ... more word timings if requested
            ]
          }
        ]
      }
    ]
  },
  "metadata": {
    // Any metadata you included in the request
  }
}
```

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