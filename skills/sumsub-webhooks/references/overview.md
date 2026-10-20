# Sumsub Webhooks Overview

## What Are Sumsub Webhooks?

Sumsub is an identity verification (KYC/KYB), transaction monitoring and fraud prevention platform. It sends webhooks as `POST` requests with a JSON body to an HTTPS endpoint you configure in the **Webhook manager** whenever an applicant, applicant action, transaction or case changes state. The event name is the `type` field in the body.

Sumsub deliberately keeps personal data out of webhooks: payloads carry identifiers and statuses (`applicantId`, `externalUserId`, `reviewStatus`, `reviewResult`). Call the Sumsub API with the `applicantId` when you need the applicant's details.

## Common Event Types

These are the events the examples handle:

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `applicantCreated` | Applicant is created via WebSDK/MobileSDK, verification link, API, or as a KYB beneficiary | Link `applicantId` to your user (`externalUserId`) |
| `applicantPending` | Review status changes to `pending` (applicant submitted the level) | Show "verification in progress" |
| `applicantReviewed` | Applicant receives a final result | Approve (`GREEN`) or reject (`RED`) the user |
| `applicantOnHold` | Review status changes to `onHold` (manual review, AML match, video ident) | Notify compliance; may repeat for the same applicant |
| `applicantActionPending` | An applicant action's review status changes to `pending` | Track action checks in progress |
| `applicantActionReviewed` | An applicant action receives a result | Apply the result of a payment-method or crypto check |
| `applicantReset` | Applicant is reset | Clear cached verification state |
| `applicantDeleted` | Applicant is deleted (`fullDelete` strategy) | Remove local references |

### Other user verification events

`applicantActionOnHold`, `applicantActionLevelChanged`, `applicantPersonalInfoChanged`, `applicantTagsChanged`, `applicantActivated`, `applicantDeactivated`, `applicantPrechecked`, `applicantLevelChanged`, `applicantRiskLevelChanged`, `applicantWorkflowCompleted`, `applicantWorkflowFailed`, `applicantAwaitingService`, `applicantAwaitingUser`, `applicantStepsReset`, `applicantPersonalDataDeleted`, `applicantVerificationLinkOpened`, `applicantShareTokenConsumed`, `applicantShareTokenFailed`, `verificationLinkSdkEvent`.

### Transaction monitoring and case management events

- Transaction monitoring: `applicantKytTxnCreated`, `applicantKytTxnApproved`, `applicantKytTxnRejected`, `applicantKytTxnReviewed`, `applicantKytOnHold`, `applicantKytTxnAwaitingUser`, `applicantKytTxnDataChanged`, `applicantKytTxnDeleted`.
- Case management: `kytCaseCreated`, `kytCaseReviewed`, `kytCaseStatusChanged`.

When a verification level uses a **workflow**, `applicantReviewed` is deferred until the workflow completes, and `applicantAwaitingUser`, `applicantAwaitingService`, `applicantWorkflowCompleted` and `applicantWorkflowFailed` may also be sent.

## Event Payload Structure

```json
{
  "applicantId": "5cb56e8e0a975a35f333cb83",
  "inspectionId": "5cb56e8e0a975a35f333cb84",
  "applicantType": "individual",
  "correlationId": "req-a260b669-4f14-4bb5-a4c5-ac0218acb9a4",
  "externalUserId": "externalUserId",
  "levelName": "id-and-liveness",
  "type": "applicantReviewed",
  "sandboxMode": false,
  "reviewResult": {
    "reviewAnswer": "GREEN"
  },
  "reviewStatus": "completed",
  "createdAtMs": "2020-02-21 13:23:19.321",
  "clientId": "coolClientId"
}
```

| Field | Description |
|-------|-------------|
| `type` | Event name |
| `applicantId` | Sumsub applicant ID |
| `applicantActionId` | Present on `applicantAction*` events |
| `externalUserId` | Your own user ID, set when the applicant was created |
| `applicantType` | `individual` or `company` |
| `levelName` | Verification level |
| `reviewStatus` | `init`, `pending`, `onHold`, `completed`, … |
| `reviewResult.reviewAnswer` | `GREEN` (approved) or `RED` (rejected) |
| `reviewResult.reviewRejectType` | `RETRY` (applicant can resubmit) or `FINAL` |
| `correlationId` | Shared by all events triggered by the same operation |
| `createdAtMs` | `yyyy-MM-dd HH:mm:ss.fff` in UTC |
| `sandboxMode` | `true` when sent from the Sandbox environment |
| `testMode` | Present and `true` only for **Test webhook** sends; omitted otherwise |

`reviewResult.clientComment` may contain private information on `FINAL` rejections. Don't show it to applicants; use `moderationComment` for that.

## Delivery and Retries

- HTTPS only, TLS 1.2+. Your endpoint must accept the connection within **1 second** and respond within **10 seconds**.
- Failed deliveries are resent **5 times** (6 attempts total):
  - `applicantActionPending`, `applicantActionReviewed`, `applicantActionOnHold`: 30 s → 30 s → 1 min → 5 min → 5 min
  - All other webhooks: 1 min → 5 min → 1 h → 5 h → 18 h
- HTTP **401, 403 and 404 are permanent**: the delivery fails immediately with no retries. All other non-2xx codes, timeouts and network errors are retried.
- A webhook that keeps failing is automatically disabled. Users with *Manage company settings* get an email when that happens.
- Sumsub sends no delivery-ID header, so deduplicate on payload fields such as `applicantId` + `type` + `createdAtMs` (plus `applicantActionId` when present).

## Full Event Reference

- [User verification webhooks](https://docs.sumsub.com/docs/user-verification-webhooks)
- [Transaction monitoring webhooks](https://docs.sumsub.com/docs/transaction-monitoring-webhooks)
- [Case management webhooks](https://docs.sumsub.com/docs/case-management-webhooks)
- [Webhook manager](https://docs.sumsub.com/docs/webhook-manager)
