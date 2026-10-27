# Upload-Post Webhooks Overview

## What Are Upload-Post Webhooks?

Upload-Post (upload-post.com) is an API for publishing to many social networks. It POSTs JSON to your webhook URL to report upload results, social-account connection changes and, if you opt in, Instagram DMs and comments on Instagram, TikTok and LinkedIn Company Page posts.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `upload_completed` | An upload finished | Record per-platform results, notify the user |
| `social_account_connected` | A social account was connected | Mark the account usable in your UI |
| `social_account_disconnected` | A social account was disconnected (`reason`, e.g. `manual_disconnect`) | Disable scheduling for that account |
| `social_account_reauth_required` | A token needs re-authorization (`reason`, e.g. `token_refresh_threshold_exceeded`) | Prompt the user to reconnect |
| `dm_received` | An Instagram DM arrived (opt-in) | Inbox sync, auto-replies |
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

One attempt per event, 10 s timeout. A refused connection or non-2xx response loses the event. After 5 consecutive failures the channel pauses for 30 minutes. There are no retries, so return 2xx quickly.

## Full Event Reference

For the complete list of events and payloads, see [Upload-Post's webhook documentation](https://docs.upload-post.com/api/webhooks).
