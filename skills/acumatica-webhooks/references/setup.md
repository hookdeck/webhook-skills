# Setting Up Acumatica Webhooks

## Prerequisites

- An Acumatica instance where you can open the Push Notifications (SM302000) form
- A generic inquiry to monitor (see the recommendations for data queries in the Integration Development Guide)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 acumatica --path /webhooks/acumatica` locally)

## Choose Your Secret Header

Acumatica does not sign requests. Instead the Webhook destination can add one header to every
POST. Pick a header name and a long random value:

| Destination box | Example | Environment variable |
|-----------------|---------|----------------------|
| Header Name | `Authorization` | `ACUMATICA_WEBHOOK_HEADER` |
| Header Value | `Bearer 9f2c...` | `ACUMATICA_WEBHOOK_SECRET` |

Store the **exact whole Header Value** in `ACUMATICA_WEBHOOK_SECRET`, including `Bearer ` if you
typed it. If you leave the header name as `Authorization`, `ACUMATICA_WEBHOOK_HEADER` can be
omitted. Don't use `Accept` or `Content-Type`; Acumatica sets those automatically.

## Register Your Endpoint

1. Open **Push Notifications** (SM302000).
2. In the Summary area, enter a **Destination Name** and select **Webhook** as the
   **Destination Type**.
3. Enter your HTTPS URL in **Address** (for example `https://example.com/webhooks/acumatica`).
4. Enter the **Header Name** and **Header Value** from above.
5. Select **Active**.
6. On the **Generic Inquiries** tab, add the inquiries to monitor. Either select **Track All
   Fields** or list specific fields in the Fields table (recommended, to avoid flooding the queue).
7. Save.

## Test

Change a row that the monitored inquiry returns and check that your endpoint logs the
notification. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/acumatica \
  -H "Content-Type: application/json" \
  -H "Authorization: $ACUMATICA_WEBHOOK_SECRET" \
  -d '{"Inserted":[{"InventoryID":"AACOMPUT01"}],"Deleted":[],"Query":"Stock Items: Last Modified Date","CompanyId":"MyTenant","Id":"1af4d140-5321-41f2-a2ec-50b67f577c6c","TimeStamp":636295833829493672,"AdditionalInfo":{}}'
```

## Network Notes

Acumatica is often self-hosted, so the sender IP is your own server's. Use HTTPS and the secret
header; rotate the header value in both places if it leaks.
