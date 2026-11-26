# Azure Event Grid Webhooks - Express Example

Minimal example of receiving Azure Event Grid deliveries with Express: both
endpoint-validation handshakes, the `aeg-subscription-name` identity guard, and
channel authentication via a static delivery-property header or a Microsoft
Entra ID bearer token.

**There is no signature to verify.** Event Grid does not sign the request body —
no HMAC, no signing secret, no signature header. If you were looking for
`crypto.createHmac`, it isn't here on purpose.

## Prerequisites

- Node.js 18+
- An Azure Event Grid topic and an event subscription pointing at your endpoint
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AZURE_EVENT_GRID_SUBSCRIPTION_NAMES` to the `--name` of the event
   subscription you created, and configure one channel-authentication mode:
   - `AZURE_EVENT_GRID_DELIVERY_SECRET` (plus
     `AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER`) for a static delivery property, or
   - `AZURE_EVENT_GRID_ENTRA_TENANT_ID` + `AZURE_EVENT_GRID_ENTRA_AUDIENCE` for a
     Microsoft Entra ID protected endpoint.

   There is **no signing secret** — nothing above is an HMAC key.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is
`POST /webhooks/azure-event-grid`, and the CloudEvents preflight is
`OPTIONS /webhooks/azure-event-grid`.

## Receive webhooks locally

Event Grid only delivers to a publicly reachable **HTTPS** endpoint with a
CA-signed certificate (self-signed certificates are not supported for
validation). With Hookdeck, create a source with the **Azure Event Grid** type
in the dashboard, then forward it to this server with the Hookdeck CLI:

```bash
hookdeck login
hookdeck listen 3000 <your-azure-event-grid-source-name> --path /webhooks/azure-event-grid
```

The source answers the CloudEvents `OPTIONS` preflight. For an Event Grid schema
subscription, open the `validationUrl` from the logged validation event within
10 minutes, because your handler's response doesn't go back to Azure.

Use the source's URL as the event subscription's `--endpoint`. The
subscription is validated the moment you create it, so start the server first.

Then publish a test event to your custom topic:

```bash
topicendpoint=$(az eventgrid topic show --name my-topic -g my-rg --query "endpoint" -o tsv)
key=$(az eventgrid topic key list --name my-topic -g my-rg --query "key1" -o tsv)

curl -X POST "$topicendpoint" \
  -H "aeg-sas-key: $key" \
  -H "Content-Type: application/json" \
  -d '[{"id":"1","eventType":"Contoso.Items.ItemReceived","subject":"Contoso/foo/bar/items","eventTime":"2026-08-24T01:00:00.0000000Z","data":{"itemSku":"Standard"},"dataVersion":"1.0"}]'
```

## How it works

1. **`OPTIONS`** answers the CloudEvents v1.0 abuse-protection preflight. It
   echoes `WebHook-Request-Origin` back as `WebHook-Allowed-Origin` (or `*`),
   adds `WebHook-Allowed-Rate` and `Allow`, and **withholds those headers** to
   refuse — consent is signalled by the headers, not the status code. This
   handshake fires only when the subscription uses the CloudEvents schema.
2. **`POST`** parses the body first. Nothing is signed, so there is no raw-body
   requirement — this is the one webhook family where parsing before
   authenticating is safe.
3. Detects `Microsoft.EventGrid.SubscriptionValidationEvent` in the array.
4. Authenticates: the `aeg-subscription-name` header must be one you expect
   (checked before the handshake is answered, so a stranger's subscription can't
   self-validate against your URL), then the delivery-property secret is
   compared with `crypto.timingSafeEqual`, or the Entra bearer token is
   validated as an RS256 JWT against your tenant's JWKS.
5. Answers the handshake with **HTTP 200** and
   `{"validationResponse": "<code>"}` — a single object, not an array. 202 is
   explicitly not accepted for validation.
6. Normalises Event Grid schema (JSON **array**, `eventType`/`eventTime`/`topic`)
   and CloudEvents (single **object**, `type`/`time`/`source`) into one shape and
   loops — batching can carry up to 5,000 events.
7. Acks with 200 within Event Grid's 30-second window. Delivery is at-least-once
   and unordered, so de-duplicate on the event `id`; `aeg-delivery-count > 1`
   means this is a retry.

Fail-closed behaviour: with no delivery secret and no Entra configuration the
handler returns 500 until `AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED=true` is set
explicitly, and it refuses to complete the handshake when
`AZURE_EVENT_GRID_SUBSCRIPTION_NAMES` is empty.

## Test

```bash
npm test
```

The tests cover both handshakes, the subscription-name guard (including the
refusal to echo a validation code for an unknown subscription), Event Grid array
vs CloudEvents object normalisation, batched arrays,
`Microsoft.EventGrid.SubscriptionDeletedEvent`, retry detection via
`aeg-delivery-count`, malformed payloads, delivery-secret comparison (wrong
value, wrong length, unset, custom header name, fail-closed), and Microsoft
Entra ID token validation with **real RS256 tokens** signed by a throwaway key —
valid, wrong audience, wrong tenant, expired, wrong signing key, unknown key id,
`alg: none`, and missing or non-Bearer `Authorization`.
