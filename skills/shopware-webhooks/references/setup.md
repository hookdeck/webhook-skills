# Setting Up Shopware Webhooks

## Prerequisites

- A Shopware 6 shop (or local dev shop) that can reach your app server
- An app with a manifest and a registration endpoint (see the [App Base Guide](https://developer.shopware.com/docs/guides/plugins/apps/app-base-guide.html))
- A publicly reachable URL for the webhook endpoint (a Hookdeck CLI tunnel works for development)

## Get Your Signing Secret

Webhooks use no dashboard secret. Each shop gets its own **app secret** during the registration handshake:

1. The shop sends a signed `GET` to your app's **registration URL** (not the webhook URL).
2. Your app responds with a `proof` and its own `secret` for that shop.
3. Store that secret keyed by `shopId` (from the `shop-id` query parameter).
4. Shopware signs every webhook for that shop with this secret.

When a shop re-registers (secret rotation, shop URL change), the secret changes. The confirmation request carries `shopware-shop-signature` (new secret) and `shopware-shop-signature-previous` (old secret).

## Register Your Endpoint

Declare webhooks in `manifest.xml`:

```xml
<webhooks>
    <webhook name="order-placed" url="https://example.com/webhooks/shopware" event="checkout.order.placed"/>
    <webhook name="product-changed" url="https://example.com/webhooks/shopware" event="product.written"/>
</webhooks>
```

The app also needs read permissions for the entities in the events (for example `order:read`). Reinstall or update the app to apply manifest changes. Optionally add `onlyLiveVersion="true"` on `*.written` webhooks to skip draft versions.

## Test Mode vs Live Mode

There is no test mode. Install the app on a development shop, trigger events (place an order, edit a product), and inspect deliveries with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 shopware --path /webhooks/shopware
```
