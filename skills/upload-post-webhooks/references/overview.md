# Upload-Post Webhooks Overview

## What Are Upload-Post Webhooks?

Upload-Post (upload-post.com) is an API for publishing to many social networks. It POSTs JSON to your webhook URL to report upload results, social-account connection changes and, if you opt in, DMs (Instagram, Bluesky, Telegram), comments on Instagram, TikTok and LinkedIn Company Page posts, and raw Telegram bot updates.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `upload_completed` | An upload finished | Record per-platform results, notify the user |
| `social_account_connected` | A social account was connected | Mark the account usable in your UI |
| `social_account_disconnected` | A social account was disconnected (`reason`, e.g. `manual_disconnect`) | Disable scheduling for that account |
| `social_account_reauth_required` | A token needs re-authorization (`reason`, e.g. `token_refresh_threshold_exceeded`) | Prompt the user to reconnect |
| `dm_received` | A DM arrived on Instagram, Bluesky or your Telegram bot (opt-in) | Inbox sync, auto-replies |
| `telegram_update` | Any raw update your Telegram bot received (opt-in) | Button presses, inline queries, join requests |
| `comment_received` | A comment arrived on a connected Instagram, TikTok or LinkedIn Company Page account (opt-in; Threads rolling out) | Comment-to-DM automations |

## Event Payload Structure

The body is JSON with an `event` field. Account events carry `user_email`, `platform`, `account_name`, `status`, `profile_username` and `created_at`. A `comment_received` payload looks like:

```json
{
  "event": "comment_received",
  "user_email": "user@example.com",
  "profile_username": "my-profile",
  "platform": "instagram",
  "account_id": "17841461478253980",
  "comment": { "id": "17900000000000001", "text": "POST", "parent_id": null,
               "from": { "id": "17841400000000002", "username": "a_follower" } },
  "post": { "id": "17900000000000003", "media_product_type": "REELS" },
  "created_at": "2026-10-20T12:00:00.000000"
}
```

Requests also carry `X-Upload-Post-Event` and `User-Agent: Upload-Post-Webhooks/1.0`.

## Delivery

Delivery is at least once. A timeout, connection error, `5xx`, `408` or `429` is retried up to 6 attempts over about 8.5 hours (1 min, 5 min, 30 min, 2 h and 6 h apart); other `4xx` answers are final, and redirects aren't followed. Retries keep the body and `X-Upload-Post-Delivery`, so deduplicate on that header. After 5 consecutive failures the webhook pauses for 30 minutes and sends queued events when it resumes. Order isn't guaranteed: Upload-Post says to use the payload's `created_at`. `telegram_update` is sent once and never retried. Deliveries are listed for 7 days at `GET /api/uploadposts/webhooks/deliveries` and can be redelivered.

## Full Event Reference

For the complete list of events and payloads, see [Upload-Post's webhook documentation](https://docs.upload-post.com/api/webhooks).
