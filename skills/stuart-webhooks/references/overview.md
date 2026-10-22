# Stuart Webhooks Overview

## What Are Stuart Webhooks?

Stuart is a last-mile delivery platform. Its On-demand API sends webhooks so you can track
packages in real time instead of polling (polling can exceed Stuart's rate limits). You subscribe
a URL to a set of topics in the Stuart dashboard or through the webhook management API. A
subscription can only contain topics from one version, and an account can have at most 6
subscriptions.

Version 3 is current. Version 2 is deprecated; this skill covers v3.

Requests are not signed. If you set a *Webhook authentication header* and *key*, Stuart adds that
header to every request (see [verification.md](verification.md)). If a delivery fails, Stuart can
retry the same event up to 5 times.

## Event Types (v3 topics)

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `package_created` | The package is in the Stuart system | Store `details.package.id` next to your order |
| `courier_assigned` | A courier accepted the package | Show courier name (`details.courier.name`) |
| `courier_arriving` | Courier entered the pickup/dropoff geofence | Tell the kitchen or customer (`details.task`) |
| `package_split` | The package was split | Track `details.new_package.id` |
| `courier_waiting` | Courier waited 2 minutes at pickup/dropoff | Nudge the store or customer (`details.task`) |
| `package_delivering` | Courier has the package, heading to dropoff | "Out for delivery" |
| `package_delivered` | Package delivered | Close the order |
| `package_canceled` | Package won't be delivered | Refund or reship (`details.cancelation`) |
| `package_returning` | Undeliverable package is coming back | Flag the return (`details.return`) |
| `package_returned` | Package returned to the pickup | Restock |
| `courier_reassigning` | Courier unassigned, a new one will be found | Reset ETA (`details.reassigning`) |
| `courier_moving` | Courier location while heading to the dropoff | Live map (`details.coordinates`) |

## Event Payload Structure

```json
{
  "version": "v3",
  "occurred_at": "2023-05-02T16:08:57.000+02:00",
  "event_id": "ab1f8bcc-7eb8-48e7-9ba6-5f0c720dd231",
  "webhook_id": 2515,
  "topic": "package_delivered",
  "details": {
    "account": { "id": 451871 },
    "package": {
      "id": "10000000001",
      "reference": "1683036378",
      "client_tracking_url": "https://stuart.sandbox.followmy.delivery/...",
      "end_customer_tracking_url": "https://stuart.sandbox.followmy.delivery/..."
    }
  }
}
```

- `event_id` is unique per event except on retries, so use it to deduplicate.
- `details.package.id` equals `deliveries[].id` from job creation. `details.package.reference` is
  the `client_reference` you sent when creating the job.
- Cancelation, return and reassignment details carry `actor` (`client`, `operations` or
  `system`), `key` and `reason`.
- Stuart may add topics and fields later; ignore ones you don't recognise.

## Full Event Reference

See [Stuart's webhook documentation](https://api-docs.stuart.com/).
