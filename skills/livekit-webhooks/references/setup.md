# Setting Up LiveKit Webhooks

LiveKit Cloud and self-hosted `livekit-server` send the same request, signed the same way.
In both cases the receiver verifies with a **project API key + API secret pair**; there is
no separate per-webhook signing secret.

## Prerequisites

- A LiveKit Cloud project, or a self-hosted `livekit-server` with at least one API key
- A public HTTPS endpoint (use the Hookdeck CLI below for local development)
- A receiver that reads the raw body for `Content-Type: application/webhook+json`

## LiveKit Cloud

1. Sign in to [LiveKit Cloud](https://cloud.livekit.io) and open your project.
2. Go to **Settings → Webhooks** and select **Create new webhook**.
3. Enter a **Name** and the **URL** (e.g. `https://your-app.example.com/webhooks/livekit`).
4. Choose the **Signing API key**. Deliveries are signed with this key's secret, and the
   key appears as the token's `iss`.
5. Select **Create**.

Set your receiver's environment from that same key pair (Cloud: **Settings → API keys**):

```bash
LIVEKIT_API_KEY=APIxxxxxxxxxxxx      # the Signing API key chosen above
LIVEKIT_API_SECRET=your_api_secret   # that key's secret
```

### Send a test event

On the webhook, select **Actions → Send a test event** and pick the event to send. It is a
real, signed delivery of the chosen type. There is no handshake, challenge or URL
validation ping, so a receiver should never accept unsigned requests.

## Self-Hosted livekit-server

Add a `webhook` block to `config.yaml` (from LiveKit's docs):

```yaml
webhook:
  # The API key to use in order to sign the message
  # This must match one of the keys LiveKit is configured with
  api_key: 'api-key-to-sign-with'
  urls:
    - 'https://yourhost'
```

`api_key` must be one of the keys under the server's `keys:` map. The receiver needs that
key and its secret as `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`. Restart the server after
editing the config.

Self-hosted servers can hold several key pairs. A receiver that serves more than one should
read the token's `iss` (the API key) and look up the matching secret, rather than assuming
a single pair.

`WebHookConfig` also has `block_private_addresses` / `blocked_cidrs` / `allowed_cidrs`.
Those limit where the server may send webhooks; they are not a list of LiveKit source IPs.
LiveKit documents **no** source-IP allowlist for webhooks.

## Egress-Specific Webhooks

An Egress request can include `webhooks`: "Extra webhooks to send on egress events for this
request", each a `WebhookConfig` with `url` and `signing_key` (an API key defined for the
project). They receive that egress's events in addition to the project's webhooks, so
verify them with the pair for that `signing_key`.

## Configure Your Receiver for the Content Type

LiveKit sends `Content-Type: application/webhook+json` on purpose, so generic JSON body
parsers skip it and the signature is checked before parsing. Read the raw body:

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: 'application/webhook+json' })` on the webhook route |
| Next.js App Router | `await request.text()` |
| FastAPI | `await request.body()` |

`express.json()` and the default `express.raw()` match only `application/json`. With them,
the body arrives empty and every delivery fails verification.

## Local Development

```bash
# Express or Next.js (port 3000)
npx hookdeck-cli listen 3000 livekit --path /webhooks/livekit

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 livekit --path /webhooks/livekit
```

Paste the printed HTTPS URL into the Cloud webhook's URL field (or `webhook.urls`), then
send a test event.

## Using Hookdeck in Front of LiveKit

Hookdeck has a `LIVEKIT` source type that verifies LiveKit's signature at the edge:

1. Create a Hookdeck source of type **LiveKit**.
2. Enter the project **API key** (`api_key`) and **API secret** (`api_secret`): the pair
   whose key is the webhook's Signing API key.
3. Point the LiveKit webhook URL (Cloud or `webhook.urls`) at the Hookdeck source URL.

Hookdeck checks the token's `exp`/`nbf` against the time it **received** the request, so
its stored requests can still be re-verified after LiveKit's 5-minute token lifetime. A
receiver behind Hookdeck that re-verifies LiveKit's JWT itself must do so promptly, or
rely on Hookdeck's verification instead. See the
[hookdeck-event-gateway skill](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway).
