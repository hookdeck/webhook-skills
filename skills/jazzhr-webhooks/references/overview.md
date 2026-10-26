# JazzHR Webhooks Overview

## What Are JazzHR Webhooks?

JazzHR's Candidate Export Webhook lets partners build a custom endpoint that receives an HTTP POST whenever a candidate is exported from JazzHR, either manually ("Export Candidate" on a profile) or automatically by a Workflow Helper on a workflow step. It is configured as a **custom integration** under Settings > Integrations.

Return any `2xx` status to acknowledge. Anything else (including `3xx`) is treated as a failure and an error is shown to the user.

## Event Types

The event type is in the `X-JazzHR-Event` header, not the JSON body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `CANDIDATE-EXPORT` | A candidate is exported manually or by a workflow | Sync candidates to an HRIS, onboarding or background-check tool |
| `VERIFY` | You save the custom integration | Setup check; respond `200` |

## Event Payload Structure

`CANDIDATE-EXPORT` body:

```json
{ "candidate": { "person": { "id": { "value": "..." }, "name": { "formattedName": "..." } }, "profiles": [ ... ] } }
```

The candidate is an HROpen Candidate object: `person` (id, name, communication, customFields), and `profiles[]` with `associatedPositionOpenings` (job, `candidateStatus`) and `attachments`. `alternateIds` with scheme `JazzHR Legacy Candidate` maps to `applicant_id` in the JazzHR API. A manual export may add a `startDate` custom field.

`VERIFY` body: `{"data":"JazzHR Verify Event"}`.

## Headers

| Header | Description |
|--------|-------------|
| `X-JazzHR-Event` | `CANDIDATE-EXPORT` or `VERIFY` |
| `X-JazzHR-Signature` | HMAC-SHA256 hex digest of the body |
| `X-JazzHR-UUID` | Unique request ID |
| `X-JazzHR-Export-Context` | Optional; job associated with the export |
| `Link` | Candidate profile URL in JazzHR |
| `User-Agent` | `JazzHR` |

## URL Requirements

If your endpoint serves several JazzHR customers, the configured URL must carry a unique identifier, e.g. `https://example.service/webhook/{clientId}` or `?id={clientId}`.

## Full Event Reference

See [JazzHR Candidate Export Webhook Reference](https://apidoc.jazzhrapis.com/candidate-export/).
