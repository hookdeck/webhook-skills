# Gumlet Webhooks Overview

## What Are Gumlet Webhooks?

Gumlet (video hosting and image optimisation) makes a `POST` request to a URL you choose when
something happens outside the API request-response cycle, for example a video asset moving from
queued to ready or errored. Requests are not signed. If you set the optional **Secret Token**,
Gumlet sends it back unchanged in the `x-gumlet-token` header of every request.

> Set a Secret Token on the Gumlet webhook. Webhooks without one send nothing to verify.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `video.status.created` | A video asset is created | Track new assets |
| `video.status.stream_ready` | Video can be streamed at a single resolution | Show an early preview |
| `video.status.downloaded` | Video file is downloaded for processing | Progress updates |
| `video.status.processed` | Video is processed | Progress updates |
| `video.status.ready` | Video is ready to embed | Publish the video, store playback URLs |
| `video.status.errored` | Processing failed | Alert, retry the upload |
| `video.status.deleted` | Video asset is deleted | Remove local records |
| `video.status.repackaged` | A subtitle or audio stream was added | Refresh playback info |
| `live.video.status.created` | A live session is created | Track sessions |
| `live.video.status.preparing` | A live session is preparing to start | Status display |
| `live.video.status.ready` | A live session is ready for streaming | Show the stream key |
| `live.video.status.connected` | A live session connected to the source | Status display |
| `live.video.status.active` | A live session is streaming | Mark as live |
| `live.video.status.disconnected` | A live session disconnected from the source | Alert the streamer |
| `live.video.status.complete` | A live session ended | Link the recording |
| `event.video.uploaded` | A video is uploaded | Start downstream workflows |
| `event.video.updated` | Title, tags, description or privacy changed | Sync metadata |
| `event.embed.viewed` | A video is viewed for the first time | Analytics |
| `event.embed.cta_clicked` | A call-to-action is clicked in the embed | Analytics |
| `event.embed.form_submitted` | A lead is captured | Send to a CRM |
| `event.playlist.created` | A playlist is created | Sync playlists |
| `event.playlist.asset` | An asset is added to or removed from a playlist | Sync playlists |
| `event.playlist.deleted` | A playlist is deleted | Sync playlists |
| `event.comment.all` | A comment is added, replied to or resolved | Moderation |
| `event.channel.member_joined` | A new channel member joined | Onboarding |

## Event Payload Structure

There is no common envelope. The body is a JSON object with a `type` field naming the event; the
rest depends on the family:

- Video status (`video.status.*`): `type`, `status`, `asset_id`, `created_at`, `input`, `output`,
  plus optional `title`, `description`, `tag`.
- Live status (`live.video.status.*`): `type`, `status`, `live_asset_id`, `created_at`,
  `updated_at`, `input`, `output`, and for completed sessions `recording_asset_id` and
  `vod_collection_id`.
- Analytics and other events (`event.*`): see the Gumlet reference for each event.

Example `video.status.ready` payload (from the docs):

```json
{
  "type": "video.status.ready",
  "status": "ready",
  "asset_id": "65b168a6e99b77f116c0e488",
  "created_at": 1706125479006,
  "title": "Example Title",
  "tag": ["ball"],
  "input": { "source_url": "http://devimages.apple.com/iphone/samples/bipbop/bipbopall.m3u8", "width": 1920, "height": 1080 },
  "output": {
    "format": "abr",
    "playback_url": "https://video.gumlet.io/646df1c9173a4a2fcac180b4/65b168a6e99b77f116c0e488/main.m3u8",
    "download_url": "https://video.gumlet.io/646df1c9173a4a2fcac180b4/65b168a6e99b77f116c0e488/download.mp4"
  }
}
```

## Delivery and Retries

Any `2xx` response counts as delivered. Otherwise Gumlet retries every 30 minutes for 24 hours.

## Full Event Reference

See [Gumlet's webhook documentation](https://docs.gumlet.com/developers/webhooks/index).
