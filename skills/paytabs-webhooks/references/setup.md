# Setting Up PayTabs Webhooks

## Prerequisites

- A PayTabs merchant account and profile
- A publicly accessible HTTPS endpoint. For local work use `npx hookdeck-cli listen 3000 paytabs --path /webhooks/paytabs`
- A framework CSRF exemption for the webhook route, since the request comes from an external system

## Get Your Signing Secret

PayTabs signs with your profile **ServerKey**, the same key you use to call the PT2 API. There is no separate webhook secret. Find it in the PayTabs merchant dashboard under your profile's developer settings (the exact menu name is not given in the signature article). Store it as `PAYTABS_WEBHOOK_SECRET` and use it as-is, as UTF-8 bytes.

## Register Your Endpoint

- **Callback URL.** Set `callback` on the payment request. It is called once when the payment ends.
- **IPN listener URL.** Configure it on the profile (PayTabs' "How to configure Instant payment notification (IPN)" article). It is called on every transaction create or change.

Both must be public HTTPS URLs. Both receive a `POST` with the transaction as JSON and a `Signature` header.

## Using Hookdeck

Create a PayTabs source in Hookdeck. Paste your PayTabs profile server key. Only callback (IPN) requests are supported, not the browser return URL. Point the callback or IPN URL at the Hookdeck source URL. Hookdeck's source verifies the `signature` header and forwards the request to your destination.

## Test Mode vs Live Mode

Test transactions use references such as `TST...`. Use the ServerKey of the profile that sends the request.

## Delivery and Retries

Retries, timeout and the expected response are not documented. Reply `2xx` quickly and make handlers idempotent.
