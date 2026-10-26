# Setting Up Deliverect Webhooks

## Prerequisites

- A Deliverect partner integration (channel, POS, dispatch or retail)
- A public HTTPS endpoint (or a Hookdeck source URL) for each webhook kind you use

## Setup Note

Paste the HMAC secret from your Deliverect integration settings. Before certification, Deliverect signs with the channelLink or locationId value instead. Some Deliverect calls are GET requests, so also allow GET on this source if your integration receives them.

## Which Secret Do I Use?

One HMAC secret is provided per environment.

1. **Staging (before certification):** Deliverect signs with a temporary value, either
   - the call's `channelLink` (present in most calls to partner endpoints), or
   - the `locationId` (Dispatch API integrations and the POS Get Products webhook).
2. **Production (certified partners):** generate the HMAC secret in your Deliverect **Integration
   settings** and use that.

Set it as `DELIVERECT_WEBHOOK_SECRET`. It is used as UTF-8 bytes exactly as written: do not hex- or
base64-decode it, and do not trim anything the value contains.

## Register Your URLs

For a channel integration, your `/register` response returns one URL per webhook kind, for example
`statusUpdateURL`, `menuUpdateURL`, `snoozeUnsnoozeURL` and `busyModeURL`. Point them at one route
with a kind segment:

```
https://your-app.example.com/webhooks/deliverect/order_status_update
https://your-app.example.com/webhooks/deliverect/menu_update
https://your-app.example.com/webhooks/deliverect/snooze_unsnooze
https://your-app.example.com/webhooks/deliverect/busy_mode
```

Other integration types register their URLs in the places named in their Deliverect guides; reuse
the same route.

## Using Hookdeck

1. Create a source with type **Deliverect** and paste the secret above.
2. **Allow the methods you need on the source.** Hookdeck's Deliverect source pre-selects POST
   without managing the method (you can change it). Some Deliverect calls are GET requests with no
   body, and any other method the sender uses (PUT, PATCH, DELETE) must be allowed too, or those
   calls are not accepted.
3. Hookdeck's source verifies the signature before delivering to your destination. Your handler
   should still verify if it is reachable without Hookdeck.

```bash
npx hookdeck-cli listen 3000 deliverect --path /webhooks/deliverect
```

## Testing

Use Deliverect's staging environment with your `channelLink` / `locationId` as the secret, send a
test order or menu change, and watch the request in the Hookdeck web UI or your server logs.
