# Setting Up Freshdesk Webhooks

## Prerequisites

- A Freshdesk account on a plan with automations (Growth, Pro or Enterprise).
  Older plans (Blossom, Garden, Estate, Forest) also have them.
- Admin access to **Admin → Workflows → Automations**. In Freshdesk Omni, go to
  **Admin Settings → Configuration and Workflows → Ticket Automations**.
- A public HTTPS URL for your endpoint. For local development, use
  `npx hookdeck-cli listen 3000 freshdesk --path /webhooks/freshdesk`.

## Generate Your Shared Secret

Freshdesk has no signing secret, so you create your own:

```bash
openssl rand -hex 32
```

Put the value in your app's environment as `FRESHDESK_WEBHOOK_SECRET`. Use a hex
value: Freshdesk says the trigger won't run if there are spaces in a header.

## Create the Ticket Creation Rule

1. Go to **Admin → Workflows → Automations**, open the **Ticket Creation** tab
   and click **New Rule**.
2. Name the rule (e.g. "Webhook: ticket created") and set its conditions. For
   every ticket, use a condition that always matches, or narrow it to the
   tickets you care about.
3. Under the actions, choose **Trigger Webhook**.
4. **Callback Request Type:** `POST`.
5. **Callback URL:** `https://your-app.example.com/webhooks/freshdesk` (or your
   Hookdeck Source URL).
6. Leave **Requires authentication** off. Its wire format isn't documented.
7. Turn on **Add custom headers** and enter one line, with no spaces in the
   value:
   ```
   X-Freshdesk-Webhook-Secret: <your FRESHDESK_WEBHOOK_SECRET>
   ```
   Header names are case-insensitive. To use a different name, also set
   `FRESHDESK_WEBHOOK_HEADER` in your app.
8. **Encoding:** JSON. **Content:** Advanced. Paste:
   ```json
   {
     "event": "ticket_created",
     "triggered_event": "{{Triggered event}}",
     "ticket": {
       "id": "{{ticket.id}}",
       "subject": "{{ticket.subject}}",
       "status": "{{ticket.status}}",
       "priority": "{{ticket.priority}}",
       "requester_email": "{{ticket.requester.email}}",
       "url": "{{ticket.url}}"
     }
   }
   ```
   Use the placeholder picker in the editor to add other fields.
9. Save and enable the rule.

## Create the Ticket Updates Rule

Repeat the steps on the **Ticket Updates** tab with conditions such as "Status
is updated" or "Customer replies to ticket". Use the same URL and header, and
the same body with `"event": "ticket_updated"`.

Keep the `event` value fixed in each rule. Your handler dispatches on it.

## Test the Webhook

1. Run the example app and the Hookdeck CLI tunnel, then put the tunnel URL in
   the rule.
2. Create a ticket (for example, by emailing your support address) or update
   one so the rule's conditions match.
3. Check the delivery in the Hookdeck CLI web UI and your app logs. A `401`
   means the header name or value doesn't match `FRESHDESK_WEBHOOK_SECRET` /
   `FRESHDESK_WEBHOOK_HEADER`.

You can also test without Freshdesk:

```bash
curl -X POST http://localhost:3000/webhooks/freshdesk \
  -H "Content-Type: application/json" \
  -H "X-Freshdesk-Webhook-Secret: $FRESHDESK_WEBHOOK_SECRET" \
  -d '{"event":"ticket_created","ticket":{"id":"1042","subject":"Test"}}'
```

There's no test or sandbox mode for webhooks. Use a trial account, or a rule
whose conditions only match test tickets (e.g. a specific tag).

## Failure Emails and Retries

If your endpoint returns a non-2xx response, Freshdesk retries every 30 minutes
(48 calls in total) and emails account admins with the time and reason for the
failure. Fix the endpoint and the retries will catch up. Make sure your handler
is idempotent so the catch-up doesn't double-process.

## Using Hookdeck in Production

1. In Hookdeck, create a Connection with a **Freshdesk** source.
2. Turn on verification and enter:
   - **Header Name:** `X-Freshdesk-Webhook-Secret` (the custom header you added)
   - **Header Value:** your secret, exactly as entered in Freshdesk
3. Paste the Hookdeck Source URL into the rule's **Callback URL**.

Hookdeck rejects requests whose header doesn't match. It also queues and
retries deliveries to your app, so a short outage on your side won't turn into
Freshdesk's 30-minute retries and failure emails. The Freshdesk source lets you
pick the HTTP method, so if your rule uses `PUT` or `PATCH`, allow that method
on the source.
