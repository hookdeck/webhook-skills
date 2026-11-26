# Bunny Stream Webhooks Overview

## What Are Bunny Stream Webhooks?

[Bunny Stream](https://bunny.net/stream/) is Bunny.net's video hosting, encoding, and delivery product. A **webhook** is a POST notification Bunny sends to a URL you configure whenever a video changes state — for example when encoding finishes, encoding fails, or auto-captions are generated. This lets your application react to processing events without polling the Stream API.

Webhooks are configured **per video library** in the Bunny dashboard, and the signing secret is that library's **Read-Only API key**.

> Bunny Stream (bunny.net) is unrelated to Bunny (bunny.com), a billing platform whose webhooks use a different signature scheme. Make sure you're reading bunny.net's docs.

## The Payload Is Thin

Every Bunny Stream webhook body has the same flat shape (Bunny's documented example):

```json
{
  "IsLiveStreamWebhook": false,
  "VideoLibraryId": 133,
  "VideoGuid": "657bb740-a71b-4529-a012-528021c31a92",
  "Status": 3,
  "EventId": "0f8e2c52-6a3e-4c1f-9d55-2b8c4f6c2a10",
  "Timestamp": "2026-10-01T12:30:15.1234567Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `IsLiveStreamWebhook` | boolean | `false` for video webhooks |
| `VideoLibraryId` | integer | The video library the video belongs to |
| `VideoGuid` | string (GUID) | The unique identifier of the video |
| `Status` | integer | The event (see the Status enum below) |
| `EventId` | string (GUID) | Unique per event and unchanged on retries; deduplicate on it |
| `Timestamp` | string (UTC) | When the event happened, not when it was delivered; order by it |
| `Reason` | string | Only on statuses that have one, such as `SmartGenerationFailed` |

Bunny added `IsLiveStreamWebhook`, `EventId`, `Timestamp` and `Reason` to an existing payload, so ignore fields you don't recognise.

There is **no** title, duration, resolution, or thumbnail in the payload. When you need full metadata, call the Stream API `GET /library/{libraryId}/videos/{videoGuid}` using `VideoGuid` from the webhook. Always **verify the signature before** making the fetch-back call.

## The Event Type Lives in `Status`

Bunny Stream does not use event-name strings. The event type is the integer `Status` field:

| Status | Name | Triggered When | Common Use Cases |
|--------|------|----------------|------------------|
| `0` | Queued | Video is accepted and waiting to be processed | Show "queued" state |
| `1` | Processing | Ingest/processing has started | Progress UI |
| `2` | Encoding | Transcoding is in progress | Progress UI |
| `3` | **Finished** | Encoding completed — video is ready to play | Publish video, notify users, fetch metadata |
| `4` | Resolution finished | One resolution finished encoding (sent once per resolution; the first means playable) | Progressive availability of qualities |
| `5` | **Failed** | Encoding failed | Alert, retry upload, notify user |
| `6` | PresignedUploadStarted | A presigned/TUS upload started | Track upload lifecycle |
| `7` | PresignedUploadFinished | A presigned upload completed | Kick off downstream processing |
| `8` | PresignedUploadFailed | A presigned upload failed | Alert, retry upload |
| `9` | CaptionsGenerated | Auto-generated captions are ready | Enable captions, index transcript |
| `10` | TitleOrDescriptionGenerated | AI-generated title/description is ready | Populate metadata fields |
| `11` | CaptionGenerationFailed | Auto-caption generation failed | Alert, fall back to manual captions |
| `12` | ChaptersGenerated | AI-generated chapters are ready | Show chapters |
| `13` | MomentsGenerated | AI-generated moments are ready | Show moments |
| `32` | VideoDeleted | The video was deleted, once per video, including with its collection | Remove it from your catalogue |
| `33` | SmartGenerationFailed | One smart generation feature failed; `Reason` is `Title`, `Description`, `Chapters` or `Moments` | Alert per feature |

The two most commonly handled statuses are **`3` (Finished / encoding done)** and **`5` (Failed)**.

## Event Payload Structure

Because the payload is minimal, treat `Status` as the discriminator, `VideoGuid` as the resource identifier and `EventId` as the deduplication key. A typical handler:

1. **Verify** the `X-BunnyStream-Signature` against the raw body.
2. **Parse** the JSON and skip an `EventId` you've already processed.
3. **Switch** on `Status`, and compare `Timestamp` with the last event you stored for the video.
4. **Fetch** full video metadata from the Stream API when needed.

## Full Event Reference

For the complete, authoritative list, see [Bunny Stream Webhooks documentation](https://bunny.net/docs/stream/webhooks).
