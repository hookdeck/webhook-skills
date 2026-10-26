# Setting Up Swoogo Webhooks

## Prerequisites

- A Swoogo account with API credentials (**My Profile > API Credentials**) or access to the webhook settings in the UI
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 swoogo --path /webhooks/swoogo` locally)

## Choose a Secret Header

Pick a header name and a long random value. Swoogo sends the header on every request.

```
Authorization: Bearer 3f1c...random...
```

Any name works (`Authorization`, `X-Webhook-Secret`, ...). Store both sides of the choice:

```bash
SWOOGO_WEBHOOK_HEADER=Authorization
SWOOGO_WEBHOOK_SECRET="Bearer 3f1c...random..."   # the exact, whole header value
```

If you type `Bearer ` into the value, it is part of the secret.

## Register Your Endpoint

In the UI, add a webhook to a webhook group and set the URL, trigger object, actions and headers.
With the API ([Create Webhook](https://developer.swoogo.com/api-reference/webhooks/create-webhook)):

1. Get an OAuth token: `POST /oauth2/token` with `grant_type=client_credentials`.
2. Create a webhook group (`POST /webhook-groups/create`) assigned to your events.
3. Create the webhook:

```bash
curl -X POST "https://api.swoogo.com/api/v1/webhooks/create" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "name=Registrant updates" \
  --data-urlencode "group_id=1" \
  --data-urlencode "trigger_object=registrant" \
  --data-urlencode "trigger_on_insert=1" \
  --data-urlencode "trigger_on_update=1" \
  --data-urlencode "url=https://example.com/webhooks/swoogo?object=registrant" \
  --data-urlencode "content_type=json" \
  --data-urlencode "headers[0][key]=Authorization" \
  --data-urlencode "headers[0][value]=Bearer 3f1c...random..."
```

The `headers` array is `[{key, value}]`; check the form encoding against the current API
reference (the sample cURL names the group field `webhook_group_id`, the schema `group_id`). Create one
webhook per `trigger_object`.

## Test

Change a registrant in a test event, or replay with curl:

```bash
curl -X POST "http://localhost:3000/webhooks/swoogo?object=registrant" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 3f1c...random..." \
  -d '{"id":1234,"first_name":"Ada","email":"ada@example.com"}'
```

## Network Notes

Swoogo doesn't document source IPs, so use the secret header rather than an IP allowlist.
