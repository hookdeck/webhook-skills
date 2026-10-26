# People Data Labs Webhooks Overview

## What Are People Data Labs Webhooks?

PDL webhooks push timely person data updates at scale. When a data release updates records that
match the filters registered for your account, PDL sends an HTTPS `POST` with a JSON payload of
PDL IDs to your endpoint. Your backend can then re-enrich those records.

Webhooks are available only to Enterprise API and Data License customers. The PDL team registers
the webhook for you (target URL, headers, filters); there is no self-serve dashboard step.

## Common Event Types

PDL does not name events. There is one kind of delivery, and the registered filters decide which
updates produce it.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| person record update batch | A release updates records matching a registered filter | Re-enrich changed contacts, refresh CRM job titles or emails |

Supported filters (set at registration, not present in the payload): `education`, `job_change`,
`location`, `mobile_phone_number`, `personal_emails`, `phone_number` (which watches the
`mobile_phone` and `phone_numbers` fields; `phone_numbers` is a field, not a filter),
`social_profile`, `work_email`. If several filters are enabled on one webhook, an ID appears once
per matching filter, so the same ID can be repeated. One webhook per filter avoids that.

## Event Payload Structure

The body is a bare JSON array of PDL IDs, not an object:

```json
[
  "9adnit66-hdZ5lkBbq-AOQ_0000",
  "YraxDoP16jzyjfxtn-1XJQ_0000",
  "6Wu6sKeyNfaLF3CVBgoysg_0000"
]
```

- Up to 1,000 IDs per request; large releases arrive as several requests.
- Sent about once a month, around the time new data is released into the API and after Data
  License delivery.
- The IDs only identify records. Fetch the data with the Person Enrichment API.

## Delivery and Retries

PDL does not retry automatically. If your server doesn't return `200`, ask your PDL team to
resend; they resend the entire batch.

## Full Event Reference

See [PDL's webhook documentation](https://docs.peopledatalabs.com/docs/webhooks).
