# SAP Emarsys Webhooks Overview

## What Are SAP Emarsys Webhooks?

The Automation Center has a **Webhook node**. When a contact reaches it, Emarsys makes an HTTPS
request to the URL defined in a **Webhook node preset**. The preset fixes the URL, the
authentication method and the body, so what arrives is defined by your own configuration, not by
a vendor event catalog.

Calls are not signed. Authentication is one of:

| Method (preset) | Covered here and by Hookdeck's `EMARSYS` source |
|-----------------|-----------------------------------------------|
| HTTP basic authentication (username and password) | Yes |
| JWT authentication (secret key) | No |
| OAuth2 | No |

## Are There Event Types?

No. There is no vendor event field and no list of event names to switch on. The examples use
two clearly labelled **illustrative** payloads:

| Illustrative payload | Shape |
|----------------------|-------|
| Webhook node contact payload | Contact field values and Additional data at the top level |
| Webhook node with event_data | The same, plus `event_data` with the triggering event's attributes |

## Payload Structure

| Key | Description |
|-----|-------------|
| Contact field values | Whichever fields the preset selects, at the top level |
| Additional data | Static key-value pairs, at the top level |
| `event_data` | Optional; attributes of the event that triggered the program |
| `deduplication_id` | Operational field for idempotency |
| `ems_program_id` | Operational field: the Automation Center program |
| `event_time` | Operational field: when the event happened |

The three operational field names can be renamed in the preset; adjust your code if you rename
them. The docs don't state the HTTP method; the examples accept `POST`.

```json
{
  "email": "jane@example.com",
  "campaign_name": "spring-sale",
  "deduplication_id": "dd-1",
  "ems_program_id": 4242,
  "event_time": "2026-10-25T12:00:00Z",
  "event_data": { "order_id": "A-1" }
}
```

This sample is illustrative, not a documented payload.

## Retries and Fail-safe Mode

- A failed request is retried with intervals growing from 30 s to 10 min.
- After the 11th failure the program goes to **Fail-safe mode**.
- Returning `406` discards the contact and keeps the program running. Use it for a body you can
  never process, so the program isn't pushed toward Fail-safe mode by retries.

Retries re-send the same contact, so deduplicate with `deduplication_id` when present.

## Full Reference

See SAP's [Creating a Webhook Node Preset](https://help.sap.com/docs/SAP_EMARSYS/f8e2fafeea804018a954a8857d9dfff3/9146e550b3a74b258b2dc1643dd51e00.html).
