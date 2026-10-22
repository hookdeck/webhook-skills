# Setting Up Footprint Webhooks

## Prerequisites

- A Footprint account
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Footprint Webhook Endpoint?

Footprint's documentation says only: "Register your endpoints in the Footprint dashboard."
It doesn't document the menu path or form fields, so follow the dashboard's own webhook
settings.

1. Open the webhook settings in the Footprint dashboard and add an endpoint.
2. Enter your endpoint URL, e.g. `https://example.com/webhooks/footprint`.
3. Subscribe to the events you need. Footprint recommends `footprint.onboarding.completed`,
   `footprint.user.manual_review`, and (with continuous monitoring on the playbook)
   `footprint.watchlist_check.completed`.
4. Return an HTTP `2xx` from the endpoint to acknowledge each event.

## Where Do I Find the Signing Secret?

**Unconfirmed on Footprint's own docs.** Footprint's webhook pages never show the signing
secret. Webhooks are delivered by Svix, whose endpoint secrets start with `whsec_` and are
shown next to the endpoint. Copy the value from your Footprint dashboard and store it as:

```bash
FOOTPRINT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If your secret doesn't start with `whsec_`, the examples reject it at startup with a 500
rather than verifying with the wrong key. Adjust the check if Footprint gives you a
different format.

## Allow Footprint's IP Addresses

If a firewall sits in front of your endpoint, allow `44.228.126.217`, `50.112.21.217`,
`52.24.126.164`, `54.148.139.208`, and `2600:1f24:64:8000::/56`.

## Sandbox vs Live Mode

Payloads include `is_live` (`false` for sandbox data). Use sandbox mode to trigger test
onboardings while developing, and check `is_live` before acting on an event in production.
