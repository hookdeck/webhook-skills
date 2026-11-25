# Setting Up Terminal Webhooks

## Prerequisites

- A Terminal account with access to the dashboard
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Terminal Webhook Endpoint?

1. Create an HTTP endpoint that accepts `POST` requests, for example `/webhooks/terminal-telematics`.
2. Register its URL as a webhook endpoint in the webhooks section of the Terminal dashboard. Terminal
   recommends doing all testing in your sandbox application first.
3. Choose the events to receive. A typical integration starts with `connection.created`,
   `connection.disconnected`, `sync.completed` and `sync.failed`, then adds the data events
   (`vehicle.*`, `driver.*`, `trailer.*`, `safety_event.*`) it needs.
4. Store the endpoint's signing secret as `TERMINAL_TELEMATICS_WEBHOOK_SECRET`.

If an event type you expect isn't available, contact Terminal support: Terminal notes that some
event types need additional configuration on their side.

## Where Do I Find the Signing Secret?

Copy it from the endpoint detail in the webhooks section of Terminal's dashboard. Each endpoint has
its own secret, and it starts with `whsec_`. Use the full `whsec_...` value: the `svix` library needs
the prefix and base64-decodes the rest.

## Does Terminal Send a Validation Request?

No challenge or validation request is documented. The first request your endpoint receives is a
real signed event.

## What Should My Endpoint Return?

Respond with a `2xx` status within 30 seconds, once the signature checks out and you've accepted
the event. Terminal counts anything else, including a `3xx` or a timeout, as a failure and retries
it on Svix's schedule. Return `400` for a missing header or a bad
signature, and `500` if your secret isn't configured; the handlers here fail closed rather than
processing unverified bodies. Return `200` for event types you don't handle.

## Testing

- Use `npx hookdeck-cli listen 3000 terminal-telematics --path /webhooks/terminal-telematics` to
  receive real deliveries locally.
- Creating a sandbox connection triggers real events such as `connection.created`,
  `sync.started` and `sync.completed`. Terminal's docs also suggest Svix Play in relay mode.
- Replay a recent event from **Message Attempts** in the dashboard's webhooks section.
  Replays resend the original timestamp, so see the timestamp window notes in
  [verification.md](verification.md).
- For rare events such as safety events, Terminal's guide shows how to send signed test requests
  built from the event's schema, signed with your endpoint's secret.
