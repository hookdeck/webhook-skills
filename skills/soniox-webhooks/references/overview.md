# Soniox Webhooks Overview

## What Are Soniox Webhooks?

Soniox is a speech-to-text API. For async transcription you can pass a `webhook_url` when you
create a transcription, and Soniox POSTs to it when the transcription finishes, so you don't have
to poll. Requests are not signed. Soniox can add one custom HTTP header of your choosing to every
webhook request (`webhook_auth_header_name` / `webhook_auth_header_value`), which is how you
authenticate them.

> Soniox webhooks are not signed. Send webhook_auth_header_name and webhook_auth_header_value with every async transcription, and enter the same name and value here.

## Statuses

Soniox webhooks have no event name. The body carries a `status`:

| `status` | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| `completed` | The async transcription finished | Fetch the transcript by `id`, store or index it |
| `error` | The async transcription failed | Log, alert, retry the transcription |

## Payload Structure

```json
{
  "id": "548d023b-2b3d-4dc2-a3ef-cca26d05fd9a",
  "status": "completed"
}
```

- `id` - the transcription ID
- `status` - `completed` or `error`

The payload doesn't contain the transcript. Fetch it from the Soniox API using `id`.

## Full Reference

See [Soniox's webhook documentation](https://soniox.com/docs/stt/async/webhooks).
