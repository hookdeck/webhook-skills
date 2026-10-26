# Palmetto Finance Webhooks Overview

## What Are Palmetto Finance Webhooks?

Palmetto Finance (LightReach solar financing) calls your server when resources in your
organization change. You create a **registration** (your `hostUrl`), then add **subscriptions**
that pick an `endpointUrl` path, an `httpMethod` and the `eventType` names to receive (or
`allEvents`). The full URL is `hostUrl` + `endpointUrl`.

Webhooks are **not signed**. With the default server API key authentication, each request
carries an `apiKey` header with the key Palmetto returned when you registered. Events are
scoped to your organization unless the registration sets `includeVisibleOrgEvents`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `accountCreated` | A new account is created | Create the customer record |
| `accountUpdated` | An account is updated | Sync account fields |
| `sendInvite` | A consumer application invite is sent | Track invite delivery |
| `applicationStatus` | A credit application's status changes | Update the application stage |
| `contractApproved` | A signed contract is approved | Release the next project step |
| `contractSending` | An async contract send has begun | Show "sending" in your UI |
| `contractSent` | A contract is sent to the consumer | Notify the installer |
| `contractSigned` | The consumer signs a contract | Start project scheduling |
| `contractVoided` | A contract is voided | Cancel dependent work |
| `contractReinstated` | A voided contract is reinstated | Resume dependent work |
| `documentStatus` | An uploaded document's status changes | Handle approved or rejected documents |
| `documentUploaded` | A new document is uploaded | Fetch and store the file |
| `milestonePackage` | Milestone package events | Track funding packages |
| `milestoneAchieved` | A milestone is reached | Advance the project |
| `milestoneStatusChanged` | A milestone's status changes | Sync milestone state |
| `quoteCreated` | A quote is created | Store the quote |
| `quoteVoided` | A quote is voided | Remove the quote |
| `requirementStatusChanged` | An account requirement's status changes | Update the checklist |
| `requirementCompleted` | An account requirement is completed | Tick the checklist |
| `termsAndConditionsAccepted` | Terms and conditions are accepted | Record consent |
| `allConsumerTaskEvents` | A consumer task is created, updated or outstanding | Inspect `status` and `activityType` |

Other subscription names in Palmetto's docs: `activeQuoteExceedsMonthlyPaymentCaps`,
`allStipulationsCleared`, `illinoisShineDisclosureSent`, `illinoisShineDisclosureSigned`,
`stipulationAdded` and `stipulationCleared`. Group subscriptions `allEvents`,
`allConsumerTaskEvents`, `allContractEvents` and `allStipulationEvents` deliver the events in
their group. The examples acknowledge any event they don't recognize with `200`.

## Event Payload Structure

A flat object: `event` plus the event's fields. All carry identifiers for the resource:

```json
{
  "event": "accountCreated",
  "accountId": "palmetto-finance-account-id",
  "accountReference": "account-external-reference",
  "organizationId": "the id of the organization this account belongs to",
  "programType": "solar | hvac | newHomes | waterHeater"
}
```

Other events add their own fields, for example `applicationId` and `applicants` on
`applicationStatus`, `contractReference` and `quoteReference` on `contractSigned`, `quoteId`
on `quoteCreated`, `documentId` and `documentType` on `documentUploaded`, and `newMilestone`
on `milestoneAchieved`.

## Delivery

- Each attempt has a 30-second timeout.
- `5xx`, `429` and network errors are retried up to 9 times (10 attempts) with exponential
  backoff starting at 3 minutes.
- Other `4xx` responses (for example `401` or `404`) are not retried.
- 10 failures disable the subscription. Events while it is disabled are logged as skipped, and
  can be replayed after you re-enable it.

## Full Event Reference

See [Palmetto's webhook documentation](https://docs.palmetto.com/finance/webhooks/).
