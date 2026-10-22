# Setting Up Breezy HR Webhooks

## Prerequisites

- A Breezy HR **Pro** plan (webhooks are not on lower plans; contact Breezy support)
- A Breezy API access token
- A publicly reachable HTTPS endpoint (no localhost or private IPs)

## How Do I Create a Webhook Endpoint?

There is no dashboard form; endpoints are created through the API.

1. Find your company ID:

   ```bash
   curl https://api.breezy.hr/v3/companies -H "Authorization: {your_api_token}"
   ```

2. Create the endpoint:

   ```bash
   curl -X POST https://api.breezy.hr/v3/company/{company_id}/webhook_endpoints \
     -H "Authorization: {your_api_token}" \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://your-server.com/webhooks/breezy-hr",
       "description": "My webhook endpoint",
       "events": ["candidateAdded", "candidateStatusUpdated"]
     }'
   ```

## Get Your Signing Secret

The response includes a `secret` (`whsec_...`). **It is shown only once**, so
store it immediately as `BREEZY_HR_WEBHOOK_SECRET`. Use the whole string,
including the `whsec_` prefix, as the HMAC key.

## Manage Endpoints

| Action | Call |
|--------|------|
| List | `GET /v3/company/{company_id}/webhook_endpoints` |
| Update events | `PUT /v3/company/{company_id}/webhook_endpoint/{id}` with `{"events": [...]}` |
| Pause / resume | `POST .../webhook_endpoint/{id}/pause` and `/resume` |
| Delete | `DELETE .../webhook_endpoint/{id}` |

Listing returns delivery stats (`successful_deliveries`, `failed_deliveries`,
`last_delivery_at`), which helps when you are not receiving events.

## Test Your Endpoint

Add a candidate to a position in Breezy and check your server logs. For local
development run `npx hookdeck-cli listen 3000 breezy-hr --path /webhooks/breezy-hr`
and register the tunnel URL, because Breezy blocks localhost URLs.

## Not Receiving Webhooks?

- Endpoint `status` is `active` and `enabled` is `true`
- The endpoint is subscribed to the event type you expect
- The URL is public HTTPS with a valid certificate
- `failed_deliveries` is not climbing
