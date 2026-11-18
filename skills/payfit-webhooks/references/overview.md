# PayFit Webhooks Overview

## What PayFit Sends

PayFit's webhooks let partners "be notified when key events occur", so they can sync only when something changed instead of polling the API. Access is for partners and must be requested from PayFit.

Deliveries come from Svix. PayFit's [webhooks page](https://developers.payfit.io/docs/payfit-webhooks) links to its event catalogue, a Svix-hosted page titled "Webhook Events | Payfit · Svix" for PayFit's Svix organization (EU region), which in turn points to Svix's guide for consuming webhooks.

## Events

From the [PayFit event catalogue](https://www.svix.com/event-types/eu/org_2OKOXEuHkmc3oMFNlQ8M357ssHn/):

| Event | Description | Example `data` |
|---|---|---|
| `integration.activated` | "Triggered when a client activates an integration" | `{ "companyId": "602e441f3e724b4d74a9cc87", "effectiveDate": "2023-01-13T20:20:39+00:00" }` |
| `integration.deactivated` | "Triggered when a client deactivates an integration" | same shape |
| `payroll.run` | "Triggered when client run a payroll" | `{ "companyId": "…", "effectiveDate": "2023-01-30T13:02:33+00:00", "payrollMonth": "202301" }` |

Every body is `{ "type": "<event>", "data": { … } }`. `payrollMonth` matches `^2\d{3}(0[1-9]|1[0-2])$` (`YYYYMM`). PayFit says more employee lifecycle events are coming.

The events are signals: fetch the details (payroll data, employees) from the PayFit API with the `companyId`.

## Delivery and Retries

PayFit doesn't document delivery behaviour. These are Svix's documented defaults ([Retry Schedule](https://docs.svix.com/retries)), which a sender can change:

| Topic | Svix default |
|---|---|
| Success | A `2xx` within a reasonable time (30 s with Svix). `3xx` counts as a failure |
| Retries | Immediately, then 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours after each failure |
| Disabling | An endpoint whose attempts all fail for 5 days is disabled |
| Manual | The dashboard can resend a message, Recover Failed messages since a date, or Replay Missing ones |

Retries and recovered messages keep their `svix-id`: dedupe on it.
