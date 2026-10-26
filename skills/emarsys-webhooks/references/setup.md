# Setting Up SAP Emarsys Webhooks

## Prerequisites

- A SAP Emarsys account with access to the Automation Center
- A public **HTTPS** endpoint (the preset accepts HTTPS URLs only). For local work use
  `npx hookdeck-cli listen 3000 emarsys --path /webhooks/emarsys` and paste the printed URL.

## Create the Webhook Node Preset

1. In Emarsys, go to **Automation > Webhook Node Presets > Create preset**.
2. Enter your HTTPS URL.
3. Pick the authentication method.

   Choose HTTP basic authentication in the Webhook node preset. Hookdeck never answers with a 401 challenge, so the credentials have to arrive with each request; if deliveries show as failed verification, they are not.

   The preset also offers JWT authentication (secret key) and OAuth2. Hookdeck's SAP Emarsys
   source (type `EMARSYS`) and these examples cover HTTP basic only; JWT and OAuth2 are not
   covered.
4. Enter a username and password. Store them as `EMARSYS_WEBHOOK_USERNAME` and
   `EMARSYS_WEBHOOK_PASSWORD`.
5. Define the body: contact field values, Additional data (static key-values), optional
   `event_data`, and the operational fields `deduplication_id`, `ems_program_id` and
   `event_time` (renamable).
6. Add a Webhook node that uses the preset to an Automation Center program.

## Preemptive Credentials

The docs don't say whether Basic credentials are sent preemptively. Your endpoint must not rely
on a `401` + `WWW-Authenticate` round trip, and neither does Hookdeck: it never sends the
challenge, so the credentials must arrive with each request.

## Test

Emarsys has no sample-event catalog for this node. Use the illustrative payloads from the
example tests, or send one by hand:

```bash
curl -X POST "$ENDPOINT_URL" \
  -H "Authorization: Basic $(printf '%s' "$EMARSYS_WEBHOOK_USERNAME:$EMARSYS_WEBHOOK_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","deduplication_id":"dd-1"}'
```

## Responses

Return `200` when handled, `401` for bad credentials, and `406` for a body you will never be
able to process (the contact is discarded and the program keeps running). Other failures are
retried and eventually put the program in Fail-safe mode; see [overview.md](overview.md).
