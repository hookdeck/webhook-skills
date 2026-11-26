# Setting Up PayTabs Webhooks

## Prerequisites

- A PayTabs merchant account and profile
- A publicly accessible HTTPS endpoint. For local work use `npx hookdeck-cli listen 3000 paytabs --path /webhooks/paytabs`
- A framework CSRF exemption for the webhook route, since the request comes from an external system

## Get Your Signing Secret

PayTabs signs with a profile **server key**, the same kind of key you use to call the PT2 API. There is no separate webhook secret. Keys are under **Developers > API Keys > Key Management** in your region's merchant dashboard. PayTabs signs with the server key the payment request used; for transactions with no payment request (PayLinks, dashboard invoices) it uses the key marked **Set as default signature key**. Use one key for both if you can. Store it as `PAYTABS_WEBHOOK_SECRET` and use it as-is, as UTF-8 bytes.

## Register Your Endpoint

- **Callback URL.** Set `callback` on the payment request. It is called once when the payment ends.
- **IPN listener URL.** Add an IPN config under **Developers > Payment Notification > Configuration** and pick the **Default Web** type ([How to configure IPN](https://support.paytabs.com/en/support/solutions/articles/60000710069)). It is called on every transaction create or change. If you also pass a callback, the config's `with_callback` setting decides whether both are called or only the callback.

Both must be public URLs. The IPN URL must be HTTPS or its body is empty, and the callback URL can't contain a port number. Both receive a `POST` with the transaction as JSON and a `Signature` header.

## Using Hookdeck

Create a PayTabs source in Hookdeck. Paste your PayTabs profile server key. Only callback (IPN) requests are supported, not the browser return URL. Point the callback or IPN URL at the Hookdeck source URL. Hookdeck's source verifies the signature and forwards the request to your destination.

## Test Mode vs Live Mode

Test transactions use references such as `TST...`. Use the ServerKey of the profile that sends the request.

## Delivery and Retries

The IPN expects a `200 OK`. Without one it is queued and retried up to 5 times with an increasing delay, then PayTabs adds a note to the transaction. The timeout is not documented. Reply `200` quickly and make handlers idempotent.
