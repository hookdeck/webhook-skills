# Dropbox Webhooks Overview

## What Are Dropbox Webhooks?

Dropbox API apps can register a webhook URI in the App Console. When files change in an account that has authorized your app, Dropbox sends a `POST` to that URI. The notification only says *which accounts* changed; your handler fetches the actual changes with the API. (This is unrelated to Dropbox Sign webhooks.)

## Notification Types

Dropbox does not send named event types and has no event-type header. The JSON body has two top-level keys:

| Key | Triggered When | Common Use Cases |
|-----|----------------|------------------|
| `list_folder` | Files or folders change in an account that authorized your app | Sync, backup, indexing; call `/files/list_folder/continue` |
| `delta` | Same, for the legacy `/delta` API (deprecated) | Legacy integrations only |

The `challenge` verification request is a `GET` (not a notification) sent when you add or re-check the URI.

## Event Payload Structure

```json
{
  "list_folder": {
    "accounts": ["dbid:AAH4f99T0taONIb-OurWxbNQ6ywGRopQngc"]
  },
  "delta": {
    "users": [12345678]
  }
}
```

- `list_folder.accounts` — account IDs (`dbid:...`) with changes
- `delta.users` — numeric user IDs (legacy)

## Handling Changes

1. Respond `200` immediately.
2. For each account ID, call `/files/list_folder/continue` with the cursor you stored from the last `list_folder` or `list_folder/continue` call (using that account's access token).
3. Save the new cursor. Repeat while `has_more` is true.

Notifications can be batched or repeated, so make this step idempotent and serialize per account.

## Full Reference

See [Dropbox webhook documentation](https://www.dropbox.com/developers/reference/webhooks).
