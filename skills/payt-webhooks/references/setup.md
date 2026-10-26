# Setting Up Payt Webhooks

## Prerequisites

- A Payt account with access to the administration's settings
- A public HTTPS endpoint for your webhook receiver (`npx hookdeck-cli listen 3000 payt --path /webhooks/payt` gives you one for local development)

## Activate Webhooks

Webhooks are activated per administration:

1. Open the administration's `Dashboard` > `Administration settings` > `Modules`.
2. Open the `Webhooks` tab.
3. Activate all webhooks at once, or choose per webhook which ones you want.
4. Enter your endpoint URL.

## Get Your Secret

The secret key is on the webhooks `settings` page. It is shown **only once**, right after you generate it:
copy it straight into `PAYT_WEBHOOK_SECRET`. If you lose it or it leaks, generate a new one on the same page.

Use it exactly as shown (its UTF-8 bytes); don't hex- or base64-decode it.

Rotating the secret takes a short while to apply everywhere, so for a time you may receive requests signed with
either the old or the new secret. Retries pick up the new secret, and requests that exhausted their retries can be
retried manually from the settings page. If you rotate, briefly accept both secrets or expect a few `401`s to retry.

## Test Mode vs Live Mode

Payt documents no separate webhook test mode. Point a development administration at a Hookdeck CLI tunnel,
or compare against the example payloads in the [events documentation](https://docs.paytsoftware.com/webhooks/events).

## Respond Correctly

Return `200` within 10 seconds. Failed deliveries are retried up to 10 times; if they keep failing Payt
deactivates the webhook and emails you.
