# Setting Up Rebilly Webhooks

## Prerequisites

- A Rebilly account (live or sandbox) with permission to create webhooks
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 rebilly --path /webhooks/rebilly` locally)

## Hookdeck Source

Hookdeck's Rebilly source checks the webhook's HTTP basic access authentication credentials. It
doesn't check Rebilly's JWT or Ed25519 signatures, so set basic auth on the Rebilly webhook and
enter the same username and password on the source.

The credentials must arrive with each request (there is no `WWW-Authenticate` challenge round
trip). Rebilly sends them on every request once they're set. A request with wrong credentials still
gets a 200 and is recorded as failed verification. A webhook without basic auth credentials is not
authenticated at all.

## Create the Webhook

1. In the Rebilly dashboard (or through the API), create a new webhook.
2. Enter your URL, including the protocol (e.g. `https://example.com/webhooks/rebilly`).
3. Choose the **method**: GET, POST, PUT, PATCH or DELETE. POST is the usual choice for JSON events.
4. Set HTTP basic access authentication: a username and a password. Store them as
   `REBILLY_WEBHOOK_USERNAME` and `REBILLY_WEBHOOK_PASSWORD`. Rebilly then sends
   `Authorization: Basic base64(username:password)` with each request.
5. Pick the events to receive in the events filter (empty means all events), for example
   `transaction-processed`, `customer-created`, `subscription-activated` and `invoice-issued`.
6. Optionally add a body template, which replaces the default payload.
7. Save.

## Hookdeck Source and Methods

If the webhook uses GET, PUT, PATCH or DELETE, also allow that method on the Hookdeck source ([custom methods](https://hookdeck.com/docs/sources#custom-methods)). The example handlers accept all
five methods and check the credentials first for each.

## Test

Trigger an event in the sandbox (for example create a customer) and check that your endpoint logs
`customer-created`. You can also press **Test webhook** on the webhook in the Rebilly UI, or call
Rebilly's Trigger a test webhook API operation with the webhook credentials' `hash`. To replay a
known body locally, post one of the documented samples with `curl -u` and your credentials.

## Sandbox vs Live

Sandbox and live organizations are separate and sign with different keys
(`api-sandbox.rebilly.com` vs `api.rebilly.com`). Create the webhook, and its credentials, in each.

## Rotating the Credential

Basic auth credentials are a static shared secret. If they leak, change the password on the webhook
and `REBILLY_WEBHOOK_PASSWORD` together.
