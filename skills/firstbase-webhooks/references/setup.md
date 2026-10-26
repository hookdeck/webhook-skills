# Setting Up Firstbase Webhooks

## Prerequisites

- A Firstbase account with access to webhook settings
- A public HTTPS endpoint with a valid certificate that accepts `POST`
  (locally: `npx hookdeck-cli listen 3000 firstbase --path /webhooks/firstbase`)

## Choose Custom Header Authentication

Use Custom header authentication, not Auth token or OAuth.

- **Custom header** sends a header name and value that you provide. This is the option the skill
  covers.
- **Auth token** doesn't document which header it sends, so there is nothing reliable to check.
- **OAuth client credentials** need a token server on your side; not covered.

## Pick the Header and Secret

1. Choose a header name, for example `X-Firstbase-Key`, or `Authorization`.
2. Generate a long random value, for example `openssl rand -hex 32`. If you use `Authorization`,
   you may type a `Bearer ` prefix; that is fine, the prefix is part of the value.
3. Store them for your endpoint:

```bash
FIRSTBASE_WEBHOOK_HEADER=X-Firstbase-Key     # default if unset: Authorization
FIRSTBASE_WEBHOOK_SECRET=<the exact, whole value you entered in Firstbase>
```

`FIRSTBASE_WEBHOOK_SECRET` must match the whole header value byte for byte, including a
`Bearer ` prefix if you typed one.

## Register Your Endpoint

1. In Firstbase, open the webhook settings ([Setting up Webhooks](https://support.firstbase.com/hc/en-us/articles/40623853911191-Setting-up-Webhooks)).
2. Enter your HTTPS URL (e.g. `https://example.com/webhooks/firstbase`).
3. Select **Custom header** authentication and enter the header name and value from above.
4. Save. Firstbase sends notifications for orders, return orders and inventory orders with an
   `eventType` of `CREATED`, `UPDATED` or `DELETED`.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/firstbase \
  -H "Content-Type: application/json" \
  -H "$FIRSTBASE_WEBHOOK_HEADER: $FIRSTBASE_WEBHOOK_SECRET" \
  -d '{"eventType":"CREATED","id":"ord_12345"}'
```

## Rotating the Credential

Change the value in Firstbase and in `FIRSTBASE_WEBHOOK_SECRET` together. Rotate immediately if
the value leaks.
