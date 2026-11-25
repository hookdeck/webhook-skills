# Setting Up Modem Pay Webhooks

## Prerequisites

- A Modem Pay business account with dashboard access
- A public HTTPS endpoint that accepts `POST`. Modem Pay refuses local addresses like `localhost`; use the CLI to test locally.

## Register Your Endpoint

In the dashboard, go to **Developers > Webhooks** and enter the URL. Each account has one webhook in test mode and one in live mode. With the examples in this skill the path is `/webhooks/modem-pay`.

## Get Your Webhook Secret

Copy the signing secret from the same page. Revealing it asks for a one-time code sent to your email. Store it as `MODEM_PAY_WEBHOOK_SECRET` and use it exactly as shown, with no decoding or prefix stripping.

**Saving the webhook URL creates a new signing secret.** That happens when you change the URL and when you turn a disabled webhook back on. Copy the new secret to your server after any change, or every signature check fails.

Behind Hookdeck, create a source with the **Modem Pay** source type, save the Hookdeck source URL as your webhook URL in Modem Pay, then copy the new secret into the source. Hookdeck's source then verifies the signature on every request.

## Test Mode with the Modem Pay CLI

The CLI only works in test mode and needs Node.js 18 or later:

```bash
npm install -g modem-pay-cli
modempay login        # approve the code in the browser
modempay listen --forward-url http://localhost:3000/webhooks/modem-pay
modempay trigger charge.succeeded
```

`listen` opens a public URL and forwards every test-mode webhook to your local server with the body and `x-modem-signature` unchanged. While it runs, it replaces your account's **test** webhook URL and signing secret with its own, and shows that secret (`--print-secret` shows it in full). Use that secret while testing, and set your test webhook back in the dashboard when you stop. Your live webhook isn't touched.

`modempay trigger` can send `charge.created`, `charge.succeeded`, `charge.failed`, `charge.cancelled`, `payment_intent.created`, `payment_intent.cancelled`, `customer.created`, `customer.updated` and `customer.deleted`.

You can also use the Hookdeck CLI tunnel, with no account needed:

```bash
npx hookdeck-cli listen 3000 modem-pay --path /webhooks/modem-pay
```

## Test Mode vs Live Mode

Test and live webhooks have different secrets. The charge payload carries `test_mode` (`true` in the test-mode sample). Modem Pay says to check `payload.test_mode` is `false` before shipping real goods.
