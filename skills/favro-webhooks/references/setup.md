# Setting Up Favro Webhooks

## Prerequisites

- A Favro account with access to the board/widget you want to watch
- A Favro API token (organization member email + API token) if creating the
  webhook via the API
- Your application's publicly reachable webhook endpoint URL

## Two Ways to Create a Webhook

### 1. Via the API (`create-webhook`)

`POST` a webhook definition to Favro's API. The body fields are:

| Field | Description |
|-------|-------------|
| `name` | A human-readable name for the webhook |
| `widgetCommonId` | The board/widget the webhook is attached to |
| `postToUrl` | The endpoint Favro POSTs events to — **this exact string is part of the signature** |
| `secret` | The signing secret you choose — used to compute the `X-Favro-Webhook` HMAC |

The `secret` you set here is the value your handler uses as
`FAVRO_WEBHOOK_SECRET`. The `postToUrl` is the value your handler uses as
`FAVRO_WEBHOOK_URL` — they must match byte-for-byte.

### 2. In the Favro app

Open the board or backlog's menu (**...**), then **More** > **Integrations and API...**,
and select **Configure new webhook**. Enter a name, the URL to post notifications to
and a secret key, then select **Connect**. When the connection succeeds, Favro shows
the options for picking which notifications to send. The same dialog logs each
request Favro sent and the response it got (**View details**).

## The Secret

You choose the `secret` when creating the webhook. Favro uses it as the HMAC key
to sign every delivery. Store it as an environment variable and never commit it:

```bash
FAVRO_WEBHOOK_SECRET=your_webhook_secret
```

## The URL Gotcha (Important)

Favro signs each delivery over `payloadId + postToUrl`, where `postToUrl` is
**the URL exactly as you provided it at creation**. Your handler recomputes the
HMAC using a URL from configuration, so it must be identical:

```bash
FAVRO_WEBHOOK_URL=https://example.com/webhooks/favro
```

If these differ in any way — scheme (`http` vs `https`), host casing, a trailing
slash, or a query string — **every signature will fail**. When verification fails
immediately after setup, check this first.

## The Setup Ping

As soon as the webhook is created, Favro POSTs a **ping** to `postToUrl`:

```json
{ "payloadId": "ZnvqwjdLh1wmbnEj6vOfHhv8ARY=", "action": "ping", "hookId": "67973f72db34592d8fc96c48", "hook": { "url": "https://yourserver.com/webhookfromfavro" } }
```

Favro expects a `200` for every payload, the ping included. The ping
carries a `payloadId`, so it is signed with the same HMAC scheme — verify it like
any other event and return `200`. If the ping fails verification, the usual cause
is a `FAVRO_WEBHOOK_URL` mismatch (see above).

## Test the Endpoint Locally

Use the Hookdeck CLI to expose your local handler while developing. No account is
required — it creates a guest account on first run:

```bash
npx hookdeck-cli listen 3000 favro --path /webhooks/favro
```

Register the printed public URL as the `postToUrl`, and set `FAVRO_WEBHOOK_URL`
to that same URL. Creating the webhook will trigger the ping, which you can
inspect in the Hookdeck web UI.
