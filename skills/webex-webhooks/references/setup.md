# Setting Up Webex Webhooks

Webex webhooks are registered through the API; there is no dashboard form for them. The `secret` is a value **you choose** when creating the webhook — Webex doesn't generate one.

## Prerequisites

- A Webex bot, integration, or personal access token. Create bots and integrations at [developer.webex.com](https://developer.webex.com)
- A token with a read scope for the resource you subscribe to (for example `spark:messages_read` for `messages`, `spark:memberships_read` for `memberships`)
- A publicly reachable HTTPS `targetUrl` (use the Hookdeck CLI during development)

## Choose Your Signing Secret

Generate a unique, high-entropy secret for each webhook and keep it in your secret manager or environment, not in source control:

```bash
openssl rand -hex 32
```

Set the same value as `WEBEX_WEBHOOK_SECRET` in your handler.

## Register Your Endpoint

```bash
curl -X POST https://webexapis.com/v1/webhooks \
  -H "Authorization: Bearer $WEBEX_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New messages",
    "targetUrl": "https://example.com/webhooks/webex",
    "resource": "messages",
    "event": "created",
    "secret": "'"$WEBEX_WEBHOOK_SECRET"'"
  }'
```

Request fields: `name`, `targetUrl`, `resource`, `event` (all required), plus optional `filter` (e.g. `roomId=...`, combine with `&`), `secret`, and `ownedBy` (`org` for org-wide webhooks, which need an admin token).

Register one webhook per `resource`/`event` pair you care about, or use `"event": "all"` for a firehose on `messages`, `memberships`, or `rooms`. Meeting-related resources need their own scopes (for example `meeting:schedules_read` for `meetings`).

If you omit `secret`, Webex sends **no** `X-Spark-Signature` header and you can't verify the sender. Always set one.

## Test Locally

```bash
npx hookdeck-cli listen 3000 webex --path /webhooks/webex
```

Use the URL it prints (ending in `/webhooks/webex`) as `targetUrl`. Then post a message in a room the bot is in.

## Manage and Re-enable Webhooks

- `GET /v1/webhooks` lists your webhooks; `PUT /v1/webhooks/{id}` updates one; `DELETE /v1/webhooks/{id}` removes it.
- To change a secret, update the webhook with a new `secret` and change your handler's `WEBEX_WEBHOOK_SECRET` at the same time.
- If Webex disables a webhook after repeated failures, fix your endpoint and call `PUT /v1/webhooks/{id}` with `"status": "active"`. A webhook re-enabled within five minutes of being disabled has a lower failure threshold.
- A webhook created by a user who has since been deleted is disabled automatically.

## Test Mode vs Live Mode

Webex has no separate test mode. Use a test bot and a test room, and register a separate webhook (with its own secret) per environment.
