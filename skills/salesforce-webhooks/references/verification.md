# How to Verify Salesforce Outbound Messages

## Why This Is Different

Salesforce Outbound Messages have **no signature and no signing secret**. There is
no `X-Signature` header, no HMAC, and no Standard Webhooks envelope. Anyone who
knows your endpoint URL could POST to it. You therefore authenticate with a
**layered** approach:

1. **Validate the `<OrganizationId>`** in the SOAP body against your known org id.
2. **Enforce HTTPS** and **allowlist Salesforce IP ranges** at the network edge.
3. **Optionally require mutual TLS** using Salesforce's client certificate.

## 1. OrganizationId Validation (application layer)

Every message contains your org id:

```xml
<notifications xmlns="http://soap.sforce.com/2005/09/outbound">
  <OrganizationId>00Dxx0000000000EAA</OrganizationId>
  ...
</notifications>
```

Parse the SOAP body and compare `<OrganizationId>` to your `SALESFORCE_ORG_ID`
using a **timing-safe** comparison. Reject with `401` on mismatch or absence.

### Manual Verification (no Salesforce webhook SDK exists)

Salesforce ships no webhook-verification SDK — you parse the SOAP/XML yourself.

**Node.js (Express, Next.js)** with `fast-xml-parser`:

```javascript
const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

function verifyOutboundMessage(rawXml, expectedOrgId) {
  const msg = parser.parse(rawXml)?.Envelope?.Body?.notifications;
  const orgId = String(msg?.OrganizationId ?? '');
  const a = Buffer.from(orgId), b = Buffer.from(expectedOrgId);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('OrganizationId mismatch');
  }
  return msg;
}
```

**Python (FastAPI)** with the stdlib `xml.etree.ElementTree` + `hmac.compare_digest`:

```python
import hmac
import xml.etree.ElementTree as ET

def _localname(tag: str) -> str:
    return tag.split("}", 1)[-1]  # strip {namespace}

def verify_outbound_message(raw_xml: bytes, expected_org_id: str):
    root = ET.fromstring(raw_xml)  # raises ParseError on malformed XML
    org_id = next(
        (e.text or "" for e in root.iter() if _localname(e.tag) == "OrganizationId"),
        "",
    )
    if not hmac.compare_digest(org_id, expected_org_id):
        raise ValueError("OrganizationId mismatch")
    return root
```

> **Always parse the raw request body.** Salesforce sends `Content-Type: text/xml`,
> so read the raw XML string/bytes — do not run it through a JSON parser.

## 2. Return the Ack (or Salesforce retries)

On success, return HTTP **200** with `Content-Type: text/xml` and:

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

- **Valid + processed** → `200` + `<Ack>true</Ack>`.
- **Untrusted / wrong OrganizationId** → `401` (don't ack a spoofed sender).
- **Valid but processing failed** → non-200 (e.g. `500`) so Salesforce **retries**.

## 3. Network-Layer Controls

- **IP allowlist** — accept only [Salesforce IP ranges](https://help.salesforce.com/s/articleView?id=000321501&type=1).
- **HTTPS** — Salesforce requires a publicly trusted TLS cert on your endpoint.
- **Mutual TLS** — require Salesforce's client certificate so only Salesforce connects.

## Common Gotchas

- **No signature** — do not look for an `X-*-Signature` header; there isn't one.
- **Parse XML, not JSON** — the body is SOAP/XML (`text/xml`).
- **Namespaces** — the body uses `soapenv:` and `sf:` prefixes; strip them
  (`removeNSPrefix` / localname) or your lookups miss.
- **Up to 100 notifications** — `<Notification>` may be a single element or an
  array. Normalize to a list before iterating.
- **Redelivery & ordering** — messages arrive at-least-once and possibly out of
  order; make handling idempotent on `<Notification><Id>` or the sObject `<sf:Id>`.
- **You must return the Ack** — a `200` with an empty or wrong body still causes
  retries; return the exact `notificationsResponse` envelope with `<Ack>true</Ack>`.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every message retried for 24h | Endpoint not returning `<Ack>true</Ack>` or non-200 | Return the exact ack envelope with `Content-Type: text/xml` |
| `OrganizationId` mismatch (401) | Using 15-char id vs 18-char in payload | Compare against the 18-char org id from the payload/Company Information |
| Parser returns `undefined` for `notifications` | NS prefixes not stripped | Enable `removeNSPrefix` (Node) / match by localname (Python) |
| Only first record processed | `Notification` is a single object, not an array | Normalize with `[].concat(msg.Notification)` |
