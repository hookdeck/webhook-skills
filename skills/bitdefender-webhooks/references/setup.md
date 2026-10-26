# Setting Up Bitdefender Webhooks

## Prerequisites

- A GravityZone Control Center with an API key that can call the Push API
- A public HTTPS endpoint with TLS 1.2 or higher (use the Hookdeck CLI locally)
- GravityZone's Event Push Service IP addresses allowlisted, if you filter inbound traffic
  (listed in the setPushEventSettings docs)

## Choose the Authorization Value

You pick the credential yourself. It is sent verbatim as the `Authorization` header, and the
docs' example is `Bearer sfasdfw34243`. Use a long random value.

**Paste the authorization value exactly as set in GravityZone, including any "Bearer " or
"Basic " prefix.** Store it in `BITDEFENDER_AUTHORIZATION`. The receiver compares the whole
header, so `Bearer abc123` and `abc123` are different values.

## Register Your Endpoint with setPushEventSettings

Call the GravityZone Push API (JSON-RPC) with the Push API URL for your Control Center:

```json
{
  "jsonrpc": "2.0",
  "method": "setPushEventSettings",
  "id": "ad12cb61-52b3-4209-a87a-93a8530d91cb",
  "params": {
    "status": 1,
    "serviceType": "jsonRPC",
    "serviceSettings": {
      "url": "https://example.com/webhooks/bitdefender",
      "authorization": "Bearer sfasdfw34243",
      "requireValidSslCertificate": true
    },
    "subscribeToEventTypes": {
      "av": true,
      "aph": true,
      "avc": true,
      "fw": true,
      "hd": true,
      "dp": true,
      "network-sandboxing": true
    }
  }
}
```

- `status`: `1` enabled, `0` disabled.
- `requireValidSslCertificate`: `true` makes GravityZone validate your TLS certificate.
- A successful call returns `"result": true`.

## Test It

Call `sendTestPushEvent` (documented alongside `setPushEventSettings`) to have GravityZone
push a test event, and `getPushEventStats` to see delivery counts. Check the exact parameters
in the GravityZone API docs.

## Local Testing

```bash
npx hookdeck-cli listen 3000 bitdefender --path /webhooks/bitdefender
```

Use the printed URL as `serviceSettings.url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/bitdefender \
  -H "Content-Type: application/json" \
  -H "Authorization: $BITDEFENDER_AUTHORIZATION" \
  -d '{"jsonrpc":"2.0","method":"addEvents","params":{"events":[{"module":"av","computer_name":"PC-1","malware_name":"EICAR-Test-File (not a virus)","final_status":"quarantined"}]},"id":1}'
```
