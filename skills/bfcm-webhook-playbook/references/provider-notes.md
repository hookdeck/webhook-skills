# Provider Notes for BFCM

What each commerce provider does when your endpoint fails. These facts decide how much time you have, whether your direct subscription survives an outage, and what you can recover from the provider rather than from Event Gateway. Taken from each provider's official docs (checked November 2026); confirm against the linked pages before relying on a number. "Not documented" means the provider's docs don't say.

## Summary

| Provider | Response timeout | Retries | After repeated failures | Manual resend | Extra endpoints for a standby copy |
|----------|------------------|---------|-------------------------|---------------|------------------------------------|
| Shopify | 1 s connect, 5 s total | Up to 8 retries over 4 hours | Admin-API subscriptions **deleted** after repeated failures; email warning | Not documented: reconcile via API | Yes: each subscription gets its own delivery |
| Stripe | Not documented (times out "if too long") | Up to 3 days, exponential backoff (live mode) | Retries stop if the endpoint is disabled or deleted; auto-disable threshold not documented | Dashboard (15 days), CLI `stripe events resend` (30 days) | Yes: up to 16 endpoints per account |
| BigCommerce | Not documented | 11 retries over about 48 hours | Webhook **deactivated** (`is_active: false`), email sent | Not documented | Yes: up to 10 per store + app + scope, one per destination |
| WooCommerce | Not documented | Not documented | **Disabled** after more than 5 consecutive failures | Not documented | Not documented |
| PayPal | Not documented | Up to 25 times over 3 days | Marked `Failed`, can still be resent | Dashboard and API resend (events listed for 30 days) | Yes: up to 10 URLs per app |

## Shopify

Docs: [webhooks overview](https://shopify.dev/docs/apps/build/webhooks), [troubleshooting](https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks), [verifying deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries), [subscribing](https://shopify.dev/docs/apps/build/webhooks/subscribe)

- **Timeout:** 5 seconds for the whole request (troubleshooting page); the verifying-deliveries page also gives a 1-second connection timeout. Return `200` fast and process asynchronously.
- **Retries:** up to 8 retries over 4 hours, with increasing intervals.
- **Deletion:** after repeated failures (the verifying-deliveries page says 8 consecutive), a subscription created through the Admin API is **deleted**, and warning emails go to the app's emergency developer email. The subscribing page says subscriptions declared in the app configuration (`shopify.app.toml`) are not deleted. If your endpoint is down for longer than about 4 hours, you can lose the direct subscription. A standby Hookdeck subscription keeps capturing because Hookdeck always answers `200`.
- **Recovery:** no documented resend. Shopify's guidance is to recreate deleted subscriptions and import data for the outage window from the API (for example, orders filtered by `updated_at`). A standby capture is the only way to get the webhooks themselves back.
- **Multiple subscriptions:** allowed. Each subscription to a topic gets its own delivery and its own `X-Shopify-Webhook-Id`.
- **Signature:** HMAC-SHA256 of the raw body in `X-Shopify-Hmac-SHA256`. No timestamp tolerance, so replayed payloads still verify.
- **Ordering:** not guaranteed within a topic or across topics for the same resource. Use `X-Shopify-Triggered-At` or the resource's `updated_at`.
- **Deduplication:** use `X-Shopify-Webhook-Id`.

## Stripe

Docs: [webhooks](https://docs.stripe.com/webhooks), [how events work](https://docs.stripe.com/events/how-events-work), [process undelivered events](https://docs.stripe.com/webhooks/process-undelivered-events)

- **Retries:** live mode retries for up to three days with exponential backoff. Sandbox retries three times over a few hours.
- **Disabling:** retries stop if the endpoint is disabled or deleted. The docs don't give an automatic-disable threshold. Re-enabling resumes delivery of new events; don't count on events created while it was disabled being sent. List them with `GET /v1/events?delivery_success=false` and resend.
- **Manual resend:** Dashboard resend up to 15 days after the event. The Stripe CLI (`stripe events resend <event_id> --webhook-endpoint=<endpoint_id>`) goes up to 30 days. `GET /v1/events` with `delivery_success=false` lists undelivered events from the last 30 days.
- **Multiple endpoints:** up to 16 event destinations per account (live or sandbox). Each endpoint has its **own** signing secret (`whsec_...`) and can be pinned to an API version: give a standby endpoint the same API version as the direct one, and make sure the handler, or the Event Gateway source, has the standby's secret.
- **Signature tolerance:** `Stripe-Signature` includes a timestamp. Stripe's libraries reject signatures older than **5 minutes** by default; the tolerance is configurable (don't set it to 0). Payloads captured by Event Gateway and replayed or delivered late will fail this check. Verify the `x-hookdeck-signature` on deliveries from Event Gateway, or widen the tolerance for the recovery window.
- **Ordering:** not guaranteed. Stripe advises against using `created` to determine order. Fetch the current object state when order matters.

## BigCommerce

Docs: [webhooks](https://docs.bigcommerce.com/docs/integrations/webhooks)

- **Retries:** 11 retries after the first attempt, at 60 s, 180 s, 300 s, 600 s, 900 s, 1,800 s, 3,600 s, 7,200 s, 21,600 s, 50,400 s and 86,400 s, totalling about 48 hours. If a domain's success ratio drops below 90% in a two-minute window, it is blocklisted for three minutes and events move to retry queues.
- **Deactivation:** after the final retry the webhook is deactivated (`is_active: false`) and the app's registered email is notified. Re-enable by setting `is_active` back to `true` with the Update a webhook API. Webhooks are also deactivated after 90 days of inactivity.
- **Multiple endpoints:** up to 10 webhooks per store + client ID + scope, and one per distinct destination.
- **Signature:** none. Payloads are sent over TLS, with optional custom headers (for example basic auth). Each payload has a `hash` you can use for deduplication.
- **Ordering:** not documented.

## WooCommerce

Docs: [webhooks](https://woocommerce.com/document/webhooks/)

- **Disabling:** a webhook is disabled after more than five consecutive delivery failures. Any response other than `2xx`, `301` or `302` counts as a failure. The threshold can be changed with the `woocommerce_max_webhook_delivery_failures` filter.
- **Retries and resend:** not documented. Delivery logs are view-only.
- **Signature:** a per-webhook secret produces a hash sent in the request headers, so a standby webhook signs with its own secret. No timestamp tolerance is documented.
- **Ordering:** not documented.

Because WooCommerce disables quickly and documents no resend, a standby capture matters more for WooCommerce stores than for most providers.

## PayPal

Docs: [webhooks](https://developer.paypal.com/api/rest/webhooks/), [integration guide](https://developer.paypal.com/api/rest/webhooks/rest/), [events dashboard](https://developer.paypal.com/api/rest/webhooks/events-dashboard/)

- **Retries:** up to 25 times over 3 days. After that the delivery is marked `Failed` but can still be resent.
- **Manual resend:** Webhook Events dashboard (events listed for the last 30 days), or `POST /v1/notifications/webhooks-events/{id}/resend`.
- **Multiple endpoints:** up to 10 webhook URLs per app, and every subscribed URL receives each event.
- **Signature:** signs the transmission ID, timestamp (`paypal-transmission-time`), webhook ID and body CRC32. No tolerance window is documented. `POST /v1/notifications/verify-webhook-signature` is the alternative. Verification takes the `webhook_id` of the **receiving** webhook, so events captured on a standby URL verify against the standby's ID, not the direct one's.
- **Ordering:** not documented.
