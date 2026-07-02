# Setting Up Salesforce Outbound Messages

## Prerequisites

- A Salesforce org with **Customize Application** permission (admin).
- Your application's **HTTPS** webhook endpoint URL (Salesforce requires HTTPS for
  most endpoints and will reject plain HTTP; the endpoint's TLS certificate must
  be issued by a CA Salesforce trusts).
- Your **18-character Organization Id**.

## Get Your Organization Id

1. In Salesforce, go to **Setup** → **Company Information**.
2. Copy the **Salesforce.com Organization ID** (15-char). To get the 18-char
   version (recommended, case-safe), append the checksum — most integrations and
   the Outbound Message payload use the 18-char form. You can also read it from
   the `<OrganizationId>` element in a received test message.
3. Put it in your `.env` as `SALESFORCE_ORG_ID`.

## Create the Outbound Message

1. Go to **Setup** → search **Outbound Messages** (under *Process Automation*).
2. Click **New Outbound Message**.
3. Select the **object** (Account, Contact, Lead, Opportunity, Case, or custom).
4. Set:
   - **Endpoint URL** — your HTTPS listener, e.g. `https://your-app.com/webhooks/salesforce`.
   - **Fields to send** — the sObject fields included in each `<Notification>`.
   - **Send Session ID** — enable only if your listener needs to call back into the
     Salesforce API using the `<SessionId>`. Leave off if you only consume data.
5. Save. Note the generated **WSDL** (there's a "Click for WSDL" link) if you want
   to code-generate types — it defines the `notifications` request and the
   `notificationsResponse` (Ack) you must return.

## Trigger the Outbound Message

Outbound Messages don't fire on their own — attach them to automation:

- **Flow (recommended)**: Setup → **Flows** → record-triggered flow → add an
  **Action** → **Outbound Message** (or the "Send Outbound Message" element in
  older UIs).
- **Workflow Rule (legacy)**: Setup → **Workflow Rules** → add the Outbound Message
  as an **Immediate Action**.

Set the entry criteria (e.g. "Opportunity StageName changed to Closed Won").

## Endpoint Requirements

Your listener must:

1. Accept `POST` with `Content-Type: text/xml`.
2. Parse the SOAP body and validate `<OrganizationId>` (see
   [verification.md](verification.md)).
3. Return HTTP **200** with this exact SOAP ack body (`Content-Type: text/xml`):

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
     <soapenv:Body>
       <notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">
         <Ack>true</Ack>
       </notificationsResponse>
     </soapenv:Body>
   </soapenv:Envelope>
   ```

If you return a non-200 status, a timeout, a malformed body, or `<Ack>false</Ack>`,
Salesforce **retries for up to 24 hours** (exponential backoff, max 2h between tries).

## Monitor Delivery

Setup → **Outbound Messages** → **View Message Delivery Status** shows the queue,
delivery failures, and lets you retry or delete pending messages.

## Security Setup

- **HTTPS only** — Salesforce requires a publicly trusted TLS certificate.
- **IP allowlist** — restrict inbound traffic to
  [Salesforce IP ranges](https://help.salesforce.com/s/articleView?id=000321501&type=1)
  at your firewall/load balancer.
- **Mutual TLS (optional)** — download Salesforce's client certificate (Setup →
  **Certificate and Key Management** / API client certificate) and require it on
  your endpoint so only Salesforce can connect.

## Test Mode vs Production

Salesforce has no separate "test webhook" button for Outbound Messages. To test:

- Point the Endpoint URL at a tunnel (see the Local Development section in
  [SKILL.md](../SKILL.md)) and edit a matching record to trigger the automation.
- Or use **View Message Delivery Status** → **Retry** on a queued message.
