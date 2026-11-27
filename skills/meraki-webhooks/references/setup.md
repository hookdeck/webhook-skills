# Setting Up Cisco Meraki Webhooks

## Prerequisites

- A Meraki Dashboard account with organization/network **write** access
- A **publicly reachable HTTPS endpoint** with a CA-trusted certificate
  (self-signed certificates are rejected — Meraki requires valid TLS because the
  shared secret travels unencrypted in the body)

## 1. Add an HTTP Server (Webhook Receiver)

1. In the Meraki Dashboard, go to **Network-wide → Configure → Alerts**.
2. Scroll to the **Webhooks** / **HTTP servers** section.
3. Click **Add an HTTP server**.
4. Fill in:
   - **Name** — a label for this receiver.
   - **URL** — your HTTPS endpoint, e.g. `https://your-app.com/webhooks/meraki`.
   - **Shared secret** — a value you choose. This exact string is echoed back in
     every payload as the `sharedSecret` field and is what your handler compares
     against. Store it as `MERAKI_WEBHOOK_SECRET`.
   - **Payload template** — leave as the **default** unless you specifically need
     a custom Liquid template (custom templates can reshape the body and move or
     rename `sharedSecret`; see [verification.md](verification.md)).
5. Click **Add** / **Save**.

## 2. Choose Which Alerts Fire Webhooks

Still on the **Alerts** page, under the alert list, set individual alerts (or the
default network alerts) to notify your HTTP server as a webhook recipient. Only
the alerts you enable will POST to your endpoint.

## 3. Send a Test

Use the **Send test** button next to your HTTP server. Meraki POSTs a sample
payload to your URL — a quick way to confirm connectivity and that your
`sharedSecret` check passes before wiring up real alerts.

## 4. List Available Alert Types (optional, via Dashboard API)

Alert types vary by organization and product. Fetch the live list with the
Dashboard API:

```bash
curl -H "Authorization: Bearer $MERAKI_DASHBOARD_API_KEY" \
  https://api.meraki.com/api/v1/organizations/{organizationId}/webhooks/alertTypes
```

(The Dashboard API key is **only** for calling the REST API — it is not used to
verify incoming webhooks.)

## Environment Variables

```bash
MERAKI_WEBHOOK_SECRET=your_shared_secret   # The "Shared secret" set on the HTTP server
```

## Reliability Notes

- Meraki delivers alerts typically within ~90 seconds of the event.
- Respond in under 2 seconds. A failed delivery is retried up to two times
  (three attempts in total).
- If delivery **consistently fails for more than 100 attempts in 24 hours**, the
  receiver is auto-disabled and admins are emailed. Acknowledge fast (`2xx`) and
  do heavy work asynchronously.

## Local Development

Expose a local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 meraki --path /webhooks/meraki
```

Point the HTTP server URL at the tunnel URL the CLI prints, then use **Send
test** in the Dashboard.
