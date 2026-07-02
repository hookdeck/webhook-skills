# Salesforce Webhooks Overview

## What Are Salesforce "Webhooks"?

Salesforce does not have a classic HMAC-signed webhook product. There are three
ways to push record changes out of Salesforce to an external endpoint:

| Mechanism | Transport | Best For |
|-----------|-----------|----------|
| **Outbound Message** | SOAP/XML POST to your HTTPS endpoint | Simple, declarative record-change push (this skill's focus) |
| **Platform Events** | Pub/Sub API (gRPC) or CometD Streaming | Custom event-driven integrations, high volume |
| **Change Data Capture (CDC)** | Pub/Sub API (gRPC) or CometD Streaming | Streaming create/update/delete/undelete for standard & custom objects |

This skill focuses on **Outbound Messages** because they are the closest thing to
a "webhook" — Salesforce POSTs to a URL you control, and you reply with an ack.

## How Outbound Messages Work

1. You create an **Outbound Message** action in Salesforce Setup, bound to an
   sObject (Account, Contact, Lead, Opportunity, Case, or a custom object) and a
   set of fields to send.
2. A **Flow** or **Workflow Rule** invokes that Outbound Message when a record is
   created or updated.
3. Salesforce POSTs a **SOAP/XML** envelope to your endpoint URL.
4. Your endpoint parses the XML, validates the `<OrganizationId>`, processes the
   notifications, and returns a SOAP **`<Ack>true</Ack>`** response with HTTP 200.
5. If Salesforce does not receive `Ack=true` (non-200, timeout, malformed body,
   or `Ack=false`), it **retries for up to 24 hours** with exponential backoff up
   to a maximum of 2 hours between attempts.

## Common sObject "Event" Types

Outbound Messages carry no event-name string. The "event" is the **sObject type**
the Flow/Workflow was built on. The `<sObject>` element's `xsi:type` attribute
identifies it (e.g. `xsi:type="sf:Account"`).

| sObject | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `Account` | Account created or updated | Sync CRM accounts, provision/update customer records |
| `Contact` | Contact created or updated | Sync contacts, update CRM/marketing lists |
| `Lead` | Lead created or updated | Route leads, trigger enrichment, notify SDRs |
| `Opportunity` | Opportunity created, updated, or stage change | Update forecasts, notify sales, trigger fulfillment |
| `Case` | Case created or updated | Sync support tickets, alert on escalation, SLA timers |

## Message Payload Structure

Salesforce POSTs a SOAP envelope like this (`Content-Type: text/xml`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
      <OrganizationId>00Dxx0000000000EAA</OrganizationId>
      <ActionId>04kxx0000000000AAA</ActionId>
      <SessionId xsi:nil="true"/>
      <EnterpriseUrl>https://na1.salesforce.com/services/Soap/c/67.0/00Dxx0000000000</EnterpriseUrl>
      <PartnerUrl>https://na1.salesforce.com/services/Soap/u/67.0/00Dxx0000000000</PartnerUrl>
      <Notification>
        <Id>04lxx000000000AAAA</Id>
        <sObject xsi:type="sf:Account" xmlns:sf="urn:sobject.enterprise.soap.sforce.com">
          <sf:Id>001xx000003DGb2AAG</sf:Id>
          <sf:Name>Acme Corp</sf:Name>
          <sf:Phone>+1-555-0100</sf:Phone>
        </sObject>
      </Notification>
    </notifications>
  </soapenv:Body>
</soapenv:Envelope>
```

Key elements:

| Element | Description |
|---------|-------------|
| `OrganizationId` | Your 18-char Salesforce org id — validate this against your known org id |
| `ActionId` | Id of the Outbound Message action that fired |
| `SessionId` | Present only if "Send Session ID" is enabled; lets you call back into the Salesforce API |
| `EnterpriseUrl` / `PartnerUrl` | SOAP API endpoints for calling back into this org |
| `Notification` | One per changed record (up to **100** per message); contains `Id` and one `sObject` |
| `sObject` | The record's fields; `xsi:type` names the object (e.g. `sf:Account`) |

## Delivery Guarantees

- **At-least-once**: a message may be delivered **more than once**.
- **No ordering**: messages are retried independently and may arrive **out of order**.
- **24-hour retry**: undelivered messages are retried until acknowledged or 24h old.

Design handlers to be **idempotent** — key off the `<Notification>` `<Id>` or the
sObject `<sf:Id>`.

## Full Event Reference

- [Outbound Messaging](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_om_outboundmessaging.htm)
- [Platform Events](https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_events_intro.htm)
- [Change Data Capture](https://developer.salesforce.com/docs/atlas.en-us.change_data_capture.meta/change_data_capture/cdc_intro.htm)
