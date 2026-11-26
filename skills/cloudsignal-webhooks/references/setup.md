# Setting Up CloudSignal Webhooks

## Prerequisites

- A Cloudprinter.com account (Print API access).
- A publicly reachable **HTTPS** endpoint that accepts `POST` requests.
- Your endpoint's **Webhook API key** (see below).

## Get Your Webhook API Key

Each account has an **account API key** used for outbound Print API calls. Webhook
deliveries use a **separate, per-endpoint Webhook API key** that CloudSignal
includes in the body of every signal as the `apikey` field. **These are different
keys — do not compare against your account API key.**

1. Sign in to the [Cloudprinter.com Dashboard](https://admin.cloudprinter.com).
2. Locate your CloudSignal webhook configuration and copy the **Webhook API key**
   associated with the endpoint.
3. Store it in your environment as `CLOUDSIGNAL_WEBHOOK_APIKEY`:

   ```bash
   CLOUDSIGNAL_WEBHOOK_APIKEY=your_webhook_api_key
   ```

Your handler compares the incoming body `apikey` against this value with a
timing-safe comparison — see [verification.md](verification.md).

## Register Your Endpoint

You can register an endpoint in the Cloudprinter.com Dashboard, or via the
**CloudApps API** (authenticate with OAuth2 first):

```http
POST https://api.cloudprinter.com/cloudapps/2.0/cloudsignal/webhooks
```

To remove one:

```http
DELETE https://api.cloudprinter.com/cloudapps/2.0/cloudsignal/webhooks/<id>
```

When registering, provide the public URL where CloudSignal should POST signals
(e.g. `https://api.example.com/webhooks/cloudsignal`) and select the signal types
you want to receive.

## Acknowledge Correctly (Retries)

Return **HTTP 200** (or 204) as soon as you have accepted the signal. Any other
status, including other 2xx codes, or an unreachable endpoint causes CloudSignal
to **retry, up to 100 attempts over 7 days**. Acknowledge fast and do heavy work asynchronously; return
`401` only for an incorrect/missing `apikey`.

## Testing

- Put your CloudCore API interface in Sandbox mode and place a test order:
  Cloudprinter doesn't send it to a printer, but generates signals as if it were
  printed and shipped. Watch them under "CloudSignal Webhooks" > "Logs" in the
  admin dashboard, where you can also resend a signal.
- For local development, tunnel to your machine with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 cloudsignal --path /webhooks/cloudsignal
  ```

  No account is required — the CLI creates a guest account and provides a local
  tunnel plus a web UI for inspecting requests.

## Full Documentation

- [CloudSignal Webhooks v2.1](https://docs.cloudprinter.com/client/cloudsignal-webhooks-v2-1)
- [CloudSignal connected app (setup)](https://docs.cloudprinter.com/connected-apps/cloudsignal-webhooks/)
