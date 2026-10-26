# Simpro Webhooks Overview

## What Are Simpro Webhooks?

Simpro (field service management) lets you subscribe to events instead of polling the API. When a subscribed event occurs, Simpro sends a `POST` with a JSON body to the subscription's Callback URL. Each message carries an `X-Response-Signature` header for verification.

## Common Event Types

The `ID` field is the event. The docs show `test.updated` and `company.customer.updated` as payload examples; the other IDs below follow the same `<resource>.<action>` pattern. Pick the events you want in the subscription screen, which is the authoritative list for your build.

| Event (`ID`) | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `job.created` | A job is created | Create a ticket or schedule in another system |
| `company.customer.updated` | A company customer changes | Sync customer records to a CRM |
| `invoice.created` | An invoice is created | Push to accounting or notify finance |
| `quote.updated` | A quote changes | Track quote status |
| `employee.deleted` | An employee is removed | Revoke access elsewhere |
| `test.updated` | You click **Test Subscription** | Check your endpoint |

## Event Payload Structure

```json
{
  "ID": "company.customer.updated",
  "build": "{BUILD_URL}",
  "description": "Company customer #518 has been updated.",
  "name": "Company customer",
  "action": "updated",
  "reference": { "companyID": 0, "customerID": 518, "companyCustomerID": 518 },
  "date_triggered": "2019-06-28T16:35:12+10:00"
}
```

- `ID` — event name; dispatch on this
- `build` — the Simpro build URL that sent it
- `action` — `created`, `updated`, `deleted`, ...
- `reference` — raw parameters (ids) to fetch the full record via the Simpro API
- `date_triggered` — ISO 8601 timestamp

The payload does not contain the full record, so fetch it from the API using `reference`.

## Full Event Reference

See [Simpro's Web Hooks documentation](https://developer.simprogroup.com/apidoc/?page=cd8682773ab1b07fdc9661984e281ce3) and [Webhook Subscriptions](https://developer.simprogroup.com/apidoc/?page=ef201d96de80d31272bd099dbc695dfb).
