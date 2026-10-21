# Setting Up Unipile Webhooks

## Prerequisites

- A Unipile account with an API key (sent as `X-API-KEY`) and your DSN host
- At least one connected account
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen 3000 unipile --path /webhooks/unipile` while developing)

## Generate Your Shared Secret

Unipile doesn't issue a signing secret. Generate your own:

```bash
openssl rand -hex 32
```

Store it as `UNIPILE_WEBHOOK_SECRET` in your receiver's environment.

## Create the Webhook

Through the API, add the secret in `headers`:

```bash
curl --request POST \
  --url https://{YOUR_DSN}/api/v1/webhooks \
  --header 'X-API-KEY: XXXXXXXX' \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --data '{
    "request_url": "https://example.com/webhooks/unipile",
    "name": "my-webhook",
    "source": "messaging",
    "events": ["message_received", "message_read"],
    "headers": [
      { "key": "Content-Type", "value": "application/json" },
      { "key": "Unipile-Auth", "value": "<your secret>" }
    ]
  }'
```

- `source` is one of `messaging`, `email`, `email_tracking`, `users`,
  `account_status`, `calendar_event`. Create one webhook per source.
- `events` is optional. The default is `message_received` for messaging,
  `mail_received` for email, `mail_opened` for email tracking and `new_relation`
  for users.
- `account_ids` limits the webhook to specific accounts. Omit it to cover all
  current and future accounts.
- `format` is `json` (default) or `form`. The examples expect `json`.
- `enabled` turns the webhook on or off.
- `name` is sent back as `webhook_name` in messaging and email payloads.

Webhooks created in the dashboard include a JSON content type. Webhooks created
by API don't, so add the `Content-Type` header yourself (as above) if your
receiver or an automation tool needs it.

You can also manage webhooks with `GET /api/v1/webhooks` and
`DELETE /api/v1/webhooks/{id}`. To rotate the secret, create a new webhook with
the new value, then delete the old one.

## Account Status Webhooks

```json
{
  "request_url": "https://example.com/webhooks/unipile",
  "source": "account_status",
  "headers": [{ "key": "Unipile-Auth", "value": "<your secret>" }]
}
```

Without `events`, you get the usual statuses except `CONNECTING`, `OK` and
`STOPPED`. List them in `events` (e.g. `"ok"`, `"credentials"`) to receive those.

## Test

1. Send a message to a connected account and watch your logs for `message_received`.
2. Send a request by hand with the header:
   ```bash
   curl -X POST http://localhost:3000/webhooks/unipile \
     -H "Content-Type: application/json" -H "Unipile-Auth: $UNIPILE_WEBHOOK_SECRET" \
     -d '{"event":"message_received","message_id":"m1","chat_id":"c1"}'
   ```
3. Confirm a request without the header gets `401`.
