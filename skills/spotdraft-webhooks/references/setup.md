# Setting Up SpotDraft Webhooks

## Prerequisites

- A SpotDraft workspace and a user with Developer Settings permission
- API client credentials (`client-id`, `client-secret`)
- An HTTPS endpoint (use the Hookdeck CLI locally)

## Register the Endpoint

In SpotDraft, open **Settings > Developer settings > Webhooks**, add your URL (for example `https://your-app.example.com/webhooks/spotdraft`) and choose the activities. You can also register it through the API; see [Receive real-time contract events via webhooks](https://developer.spotdraft.com/docs/api-playbooks/receive-real-time-contract-events-via-webhooks).

## Fetch the hmac_key

The signing key isn't shown in the app. Fetch it with your API credentials:

```bash
curl -s "$SPOTDRAFT_API_BASE/api/v2.1/public/webhooks/hmac_key/" \
  -H "client-id: $SPOTDRAFT_CLIENT_ID" -H "client-secret: $SPOTDRAFT_CLIENT_SECRET"
# {"hmac_key": "BASE64_ENCODED_SECRET"}
```

`SPOTDRAFT_API_BASE` is your workspace's SpotDraft API host (see SpotDraft's API reference). Store `hmac_key` in `SPOTDRAFT_HMAC_KEY` exactly as returned: it's base64, and your handler decodes it. SpotDraft: "Persist the returned key securely. Use it only for webhook verification."

## Test

Send a contract to a counterparty (`CONTRACT_SENT_TO_COUNTERPARTY`) or create one (`CONTRACT_CREATED`) and check that your endpoint returns `2xx`.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 spotdraft --path /webhooks/spotdraft
```

Register the printed URL. The CLI shows each request's headers and body, which is the quickest way to see the payload fields.

## Using Hookdeck

Create a source with the **SpotDraft** source type and paste the `hmac_key` exactly as the API returns it. Hookdeck decodes the base64 and verifies `X-SD-WEBHOOK-CONTENT-HASH` (HMAC-SHA512 of the body). Verification is optional on the source, and Hookdeck applies no timestamp window.
