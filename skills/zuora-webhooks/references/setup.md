# Setting Up Zuora Callout Notifications

## Prerequisites

- A Zuora tenant with access to Extension Studio (Events & Notifications)
- A publicly reachable **HTTPS** endpoint (use `npx hookdeck-cli listen 3000 zuora --path /webhooks/zuora` locally)

## Create the Callout Template

1. In Zuora, go to **Extension Studio > Events & Notifications**.
2. Open the **Callout Templates** tab and click **+ Add New Callout Template**.
3. Basic information: give it a unique **Name**, pick the **Related Event** (for example a payment
   or invoice event), and leave **Active** on. Zuora doesn't send callouts for inactive templates.
4. Request information:
   - **Http Method:** `POST` (default), `GET`, `PUT`, `PATCH` or `DELETE`. The example handlers accept all five.
   - **Request URL:** your `https://` endpoint, e.g. `https://example.com/webhooks/zuora`.
5. Request body: select the merge fields to send. For the example handlers use a JSON body such as
   `{"event": "PaymentProcessed", "accountId": "{{DataSource.Account.Id}}"}`. (Merge field tags
   come from the template's **Available merge fields** section.)
6. Request Authentication:
   - **Authentication Type:** `Username/Password` (Basic and NTLM; use Basic).
   - **Username** and **Password:** a credential you generate, stored as `ZUORA_WEBHOOK_USERNAME`
     and `ZUORA_WEBHOOK_PASSWORD`.
   - **Tick "Enable Preemptive Authentication".** This is required. Without it Zuora sends the
     first request with no `Authorization` header and waits for a `401` challenge, which does not
     work through Hookdeck and makes every request fail the check in this skill.
7. Additional settings: tick **Retriable** if you want retries (default 3 attempts, 30 minutes
   apart). Leave the optional **HMAC** section off: its algorithm, encoding, data and header are all
   user-defined and this skill doesn't verify it.
8. Optionally **preview the callout request**, then **Save**.

## Test

Trigger the related event in a sandbox tenant, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/zuora \
  -u "$ZUORA_WEBHOOK_USERNAME:$ZUORA_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"PaymentProcessed","accountId":"2c92c0f8"}'
```

## Network Notes

The SSL certificate field on the template only helps when your receiver uses a private CA. Use a
publicly trusted certificate when you can. Zuora uses port 443 unless you ask Zuora Global Support
to enable another one.
