# Setting Up Terminal Webhooks

## Prerequisites

- A Terminal account with access to the dashboard
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Terminal Webhook Endpoint?

1. Create an HTTP endpoint that accepts `POST` requests, for example `/webhooks/terminal-telematics`.
2. Register its URL as a webhook endpoint in the Terminal dashboard. Terminal's docs only say to
   add the URL "in Terminal's dashboard"; they don't describe the screens.
3. Choose the events to receive. A typical integration starts with `connection.created`,
   `connection.disconnected`, `sync.completed` and `sync.failed`, then adds the data events
   (`vehicle.*`, `driver.*`, `trailer.*`, `safety_event.*`) it needs.
4. Store the endpoint's signing secret as `TERMINAL_TELEMATICS_WEBHOOK_SECRET`.

If an event type you expect isn't available, contact Terminal support: Terminal notes that some
event types need additional configuration on their side.

## Where Do I Find the Signing Secret?

Terminal delivers webhooks through Svix, and Svix-issued endpoint secrets start with `whsec_`.
Terminal's documentation doesn't describe where the secret is shown or print an example, and its
guide refers to Svix's documentation for verification. If you can't find it next to the endpoint in
the dashboard, ask Terminal support. Use the full `whsec_...` value: the `svix` library needs the
prefix and base64-decodes the rest.

## Does Terminal Send a Validation Request?

No challenge or validation request is documented. The first request your endpoint receives is a
real signed event.

## What Should My Endpoint Return?

Respond with a `2xx` status once the signature checks out and you've accepted the event. Terminal
counts non-`2xx` responses as failures and may retry. Return `400` for a missing header or a bad
signature, and `500` if your secret isn't configured; the handlers here fail closed rather than
processing unverified bodies. Return `200` for event types you don't handle.

## Testing

- Use `npx hookdeck-cli listen 3000 terminal-telematics --path /webhooks/terminal-telematics` to
  receive real deliveries locally.
- The Terminal dashboard shows each delivery's status and errors and lets you replay messages.
  Replays resend the original timestamp, so see the timestamp window notes in
  [verification.md](verification.md).
