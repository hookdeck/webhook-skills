# Setting Up TriNet Zenefits Webhooks

## Prerequisites

- A Zenefits (TriNet) partner application
- A publicly accessible **HTTPS** endpoint (Zenefits only supports HTTPS webhook URLs). For local work use `npx hookdeck-cli listen 3000 zenefits --path /webhooks/zenefits`

## Get Your Signing Secret

Zenefits generates a shared secret for your application and uses it to sign every webhook. Store it as `ZENEFITS_WEBHOOK_SECRET`.

**Use your app's webhook shared secret, not its OAuth client secret.** They are different keys. Using the OAuth client secret makes every signature check fail.

The docs do not give a dashboard menu path; the webhook URLs are provided during integration setup with Zenefits.

## Register Your Endpoint

1. Provide your HTTPS webhook URL during integration setup.
2. Handle the events you need, for example `people.did_create`, `people.did_change`, `employments.did_start`, `employments.did_terminate`, `flow.did_complete.hiring`.
3. Return a `2xx` as soon as the payload is stored; do the real work in a background task.

## Using Hookdeck

Create a Zenefits source in Hookdeck and paste the app's **webhook shared secret** (not the OAuth client secret) into its verification settings. Point the webhook URL in Zenefits at the Hookdeck source URL. Hookdeck verifies the `signature` header and forwards the request to your destination.

## Test Mode vs Live Mode

The docs describe no separate webhook test mode. Use the Hookdeck CLI or a webhook inspector to see real events before writing your handler.

## Retries

If your endpoint does not return a `2xx`, Zenefits retries for up to 1 hour. The same message may be delivered more than once.
