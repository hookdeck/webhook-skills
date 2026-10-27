# Fountain Webhooks Overview

## What Are Fountain Webhooks?

Fountain (fountain.com) is hiring software for hourly workforces. Fountain Hire webhooks are configured in
Company Settings -> Webhooks. Fountain sends a JSON `POST` to your endpoint for two families of events:

- **Screening events**: applicant stage transitions and background-check status (Checkr, Onfido).
- **Post-Hire events**: a worker is activated or deactivated, or documents are uploaded or approved.

There is no event-name field or header on a delivery. The payload shape tells you which family it is.

## Common Event Types

| Event | Payload shape | Triggered When | Common Use Cases |
|-------|---------------|----------------|------------------|
| `applicant` | `{ "applicant": { ... } }` | An applicant changes stage, or a background check changes status | Sync candidates to an HRIS, trigger onboarding at an "Approved" stage, track Checkr/Onfido results |
| `worker` | Flat worker object | A worker is activated or deactivated, or documents are uploaded or approved | Provision or revoke access, collect approved documents |

`applicant` and `worker` are labels this skill and its examples use for the two payload shapes; they are not
strings sent by Fountain.

## Event Payload Structure

Screening (`applicant`):

```json
{
  "applicant": {
    "id": "c780d083-6e73-4810-85a9-17e72d5b7a93",
    "name": "Logan Paucek",
    "email": "example@example.com",
    "funnel": { "title": "Fountain applicants", "id": "05e515a8-..." },
    "stage": { "title": "Approved", "id": "e2921e5b-..." },
    "background_checks": [],
    "document_signatures": [],
    "score_cards_results": []
  }
}
```

Post-Hire (`worker`):

```json
{
  "id": "70bbb9f4-bb94-4dbd-a01c-3a2f9ef3098e",
  "name": "Ms. Isaiah Bernier",
  "email": "dariana_stiedemann@streichfadel.co",
  "is_active": true,
  "approved_at": "2018-05-24T03:31:07.626-07:00",
  "data_collection_checks": [{ "id": "a94329ff-...", "status": "pending", "uploads": [] }]
}
```

The examples dispatch like this: an `applicant` object means a screening event, a string `id` plus an
`is_active` field means a worker event, anything else is acknowledged and logged.

## Delivery Behavior

- A failed request is retried 2 times.
- A webhook that fails more than 10 times in 24 hours is disabled until you fix it and re-enable it.
- The docs state no timeout; they recommend processing asynchronously.
- Requests are signed with `X-OBIQ-SIGNATURE-V2`; see [verification.md](verification.md).

## Full Event Reference

See [Fountain's webhook documentation](https://developer.fountain.com/reference/webhooks).
