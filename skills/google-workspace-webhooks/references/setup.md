# Setting Up Google Workspace Push Notifications

There is no dashboard for Workspace push notifications. You create each channel
with an API call (`watch`), and you pick the channel token yourself.

## Prerequisites

- A Google Cloud project with the relevant API enabled (Drive, Calendar, or Admin SDK)
- OAuth 2.0 credentials (user or service account) with access to the resource you
  want to watch. A watch request fails unless the caller can access the resource.
- A public **HTTPS** endpoint with a valid certificate. Self-signed, untrusted,
  revoked, or hostname-mismatched certificates are rejected. For local
  development, use the Hookdeck CLI (below).

## Generate Your Channel Token

The channel token is your shared secret. Generate a random value (max 256
characters) and store it as `GOOGLE_WORKSPACE_CHANNEL_TOKEN`:

```bash
openssl rand -hex 32
```

Google recommends an extensible encoding such as URL query parameters
(`target=myApp&secret=...`) if you also want to use the token for routing. Don't
put OAuth tokens or other sensitive data in it unencrypted.

## Create a Watch Channel

Every watch request takes the same body:

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Unique per channel (UUID recommended), max 64 chars. Echoed in `X-Goog-Channel-ID` |
| `type` | Yes | `web_hook` |
| `address` | Yes | Your HTTPS webhook URL |
| `token` | No (set it) | Your channel token, max 256 chars. Echoed in `X-Goog-Channel-Token` |
| `expiration` | No | Unix time in **milliseconds** |

### Google Drive — all changes (`changes.watch`)

```bash
# Get a start page token first, then watch from it
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://www.googleapis.com/drive/v3/changes/startPageToken"

curl -s -X POST "https://www.googleapis.com/drive/v3/changes/watch?pageToken=$PAGE_TOKEN" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$(uuidgen)\",
    \"type\": \"web_hook\",
    \"address\": \"https://your-app.example.com/webhooks/google-workspace\",
    \"token\": \"$GOOGLE_WORKSPACE_CHANNEL_TOKEN\"
  }"
```

### Google Drive — a single file (`files.watch`)

```bash
curl -s -X POST "https://www.googleapis.com/drive/v3/files/$FILE_ID/watch" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "...", "type": "web_hook", "address": "https://...", "token": "..."}'
```

### Google Calendar — events on a calendar

```bash
curl -s -X POST "https://www.googleapis.com/calendar/v3/calendars/primary/events/watch" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "...", "type": "web_hook", "address": "https://...", "token": "..."}'
```

Events and ACLs are per calendar, so watch each calendar separately. Settings and
calendar lists are per user.

### Admin SDK Directory — user events

```bash
# event = add | delete | makeAdmin | undelete | update (one per channel)
curl -s -X POST "https://admin.googleapis.com/admin/directory/v1/users/watch?customer=my_customer&event=delete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "...", "type": "web_hook", "address": "https://...", "token": "..."}'
```

### Watch response

A successful watch returns `200` with the channel. **Save `id` and `resourceId`**;
you need both to stop the channel:

```json
{
  "kind": "api#channel",
  "id": "01234567-89ab-cdef-0123456789ab",
  "resourceId": "o3hgv1538sdjfh",
  "resourceUri": "https://www.googleapis.com/drive/v3/files/o3hgv1538sdjfh",
  "token": "target=myApp-myFilesChannelDest",
  "expiration": 1426325213000
}
```

Google then sends a `sync` notification (message number `1`). It can arrive
before the watch response. Your endpoint should answer it with `200`.

## Renew Channels Before They Expire

There is no way to extend a channel. Before expiry, call `watch` again with a
**new `id`**; both channels are active during the overlap, so dedupe.

| API | Default expiry | Maximum |
|-----|----------------|---------|
| Drive `files` | 1 hour | 1 day |
| Drive `changes` | 1 hour | 1 week |
| Calendar / Directory | API-defined | API-defined (check `expiration` in the response) |

Schedule renewal from the `expiration` in the watch response, or from the
`X-Goog-Channel-Expiration` header.

## Stop a Channel

```bash
curl -s -X POST "https://www.googleapis.com/drive/v3/channels/stop" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "CHANNEL_ID", "resourceId": "RESOURCE_ID"}'
```

Use `https://www.googleapis.com/calendar/v3/channels/stop` for Calendar and
`https://admin.googleapis.com/admin/directory_v1/channels/stop` for Directory.
Only the same user and OAuth client that created a channel can stop it (any user
of the same client, for service-account channels).

## Local Development

```bash
npx hookdeck-cli listen 3000 google-workspace --path /webhooks/google-workspace
```

Use the HTTPS URL the CLI prints as `address` in the watch request. For the
FastAPI example use port `8000`.

## Test Mode

Google has no test mode or "send test event" button. To test:

1. Create a short-lived channel (for example, `files.watch` on a scratch file).
2. Confirm your endpoint receives the `sync` message.
3. Edit, rename, or trash the file to trigger `update` / `trash` notifications.
4. Stop the channel with `channels.stop`.
