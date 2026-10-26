# Setting Up Velt Webhooks

Advanced (V2) webhook endpoints are managed in the [Velt console](https://console.velt.dev/dashboard/config/webhook)
(Advanced webhooks section). The webhook pages don't describe an endpoint-management API.

> **Requirement.** Hookdeck's configuration alert for this source reads: "Only Velt Advanced (V2) webhooks, available on Enterprise, are signed. Basic (V1) webhooks send an auth token instead and fail verification."
> Basic (V1) webhooks only send an optional auth token in the `Authorization` header as
> `Basic <token>`. This skill covers Advanced (V2), which is available to Enterprise customers only.

## Prerequisites

- A Velt account on the Enterprise plan with access to Advanced webhooks in the console
- A public `https://` URL for your endpoint. For local development, use the Hookdeck CLI (see below).

## Create an Endpoint and Get Your Signing Secret

1. In the Velt console, open the Advanced webhooks section and add an endpoint with your URL, for example
   `https://webhooks.example.com/webhooks/velt`.
2. Select the event types you want. If you select none, the endpoint receives all events. Velt
   recommends narrowing this once you are past testing.
3. Copy the endpoint's signing secret. It is in the Standard Webhooks format: `whsec_` followed by a
   base64 value (for example `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`). Put the full value, prefix
   included, in `VELT_WEBHOOK_SECRET`. Each endpoint has its own secret.

Optional settings on the same page:

- **Payload encoding** (Base64) and **payload encryption** (AES-256-CBC, with the key wrapped by your RSA
  public key). Both are off by default and change the body format. The examples expect plain JSON.
- **Additional authentication** (Basic Auth in the URL, or custom headers such as `Authorization`), a
  per-endpoint **rate limit**, and **transformations** that can rewrite the method, URL and body in flight.
  Verify against the body your endpoint actually receives.
- Velt sends from a fixed set of IPs, listed in its docs, if you need a firewall allowlist.

## Send a Test Delivery

Use the endpoint's Testing tab in the console to send an example event. You can inspect the message, every
attempt and whether it succeeded. Test events are normal signed deliveries, not a handshake or challenge,
so your handler only needs to verify them and return `2xx`. No validation request is documented.

## Local Development

```bash
npx hookdeck-cli listen 3000 velt --path /webhooks/velt
```

Use the URL the CLI prints as the endpoint URL in the console. For the FastAPI example use port `8000`.

## Delivery Behavior

- A delivery succeeds on a `2xx` response within **15 seconds**. Any other status, including `3xx`
  redirects, is a failure.
- Retries follow this schedule, each period starting after the previous failure: immediately, 5 seconds,
  5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours. Then the message is marked Failed for the
  endpoint and a `message.attempt.exhausted` webhook is sent.
- Each retry is re-signed with a fresh `webhook-timestamp`; `webhook-id` stays the same.
- Retry a message manually, or "Recover" all failed messages from a date, in the console. A removed or
  disabled endpoint gets no deliveries.
- Do the heavy work asynchronously: verify the signature, enqueue, and return `2xx`.
- No ordering guarantee is documented, and the same message can arrive more than once, so make the handler
  idempotent.
