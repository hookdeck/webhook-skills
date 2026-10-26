# Setting Up Lumos Webhooks

> Use notification webhooks such as provisioning and deprovisioning. Pre-approval and request validation webhooks expect a decision back and aren't supported.

## Prerequisites

- A Lumos tenant where you can create inline webhooks
- A publicly reachable **HTTPS** endpoint. Plain HTTP is rejected, and redirects are not
  followed, so give Lumos the final URL. Use
  `npx hookdeck-cli listen 3000 lumos --path /webhooks/lumos` locally.

## Choose a Secret

Pick a long random value and a header name. Lumos stores custom header values encrypted. Examples:

| Header name | Header value |
|-------------|--------------|
| `Authorization` | `Bearer <random-value>` |
| `X-Api-Key` | `<random-value>` |

Store them as:

```bash
LUMOS_WEBHOOK_HEADER=Authorization
LUMOS_WEBHOOK_SECRET="Bearer <random-value>"
```

`LUMOS_WEBHOOK_SECRET` must be the **exact, whole** value, including any `Bearer ` prefix. If
you leave `LUMOS_WEBHOOK_HEADER` unset it defaults to `Authorization`.

## Register Your Endpoint

1. In Lumos, create a **Provisioning** or **Deprovisioning** webhook (see
   [Lumos's webhook docs](https://developers.lumos.com/docs/webhooks)).
2. Enter your HTTPS endpoint URL (e.g. `https://example.com/webhooks/lumos`).
3. Add a custom header with the name and value you chose above.
4. Attach the webhook to the application permission it should run for.

Don't use Pre-Approval or Request Validation webhooks with this setup: they expect a decision
back in the response, and Hookdeck can't return one.

The Lumos help center covers the signing secret, which you can retrieve and rotate on the
webhook settings page. This skill doesn't use it.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/lumos \
  -H "Content-Type: application/json" \
  -H "Authorization: $LUMOS_WEBHOOK_SECRET" \
  -d '{"user":{"email":"ada@example.com"},"permissions":["Agent License"]}'
```

## Network Notes

Lumos sends from a fixed set of IP addresses, so you can allowlist them in front of your
endpoint as well as checking the header.
