# Envoy Webhooks Overview

## What Are Envoy Webhooks?

Envoy is a workplace platform (visitor management, employee check-in, desk
booking). Apps built on the Envoy platform can subscribe to events; Envoy then
POSTs a JSON message to your **Webhook URL** whenever one fires, for example when
a visitor signs in or an invite is created. Delivery is for apps configured in
the Envoy dashboard (Apps → Webhooks card). Every message carries an
`X-Envoy-Signature` header.

## Common Event Types

The event name (Envoy calls it the topic) is the `event` field of the body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `entry_sign_in` | A visitor signs in | Notify the host, log attendance |
| `entry_sign_out` | A visitor signs out | Close the visit record |
| `entry_blacklist_review` | A visitor matched a blocklist rule and needs admin approval | Alert security |
| `entry_blacklist_deny` | A visitor was denied entry by a blocklist rule | Audit denied entries |
| `entry_manually_updated` | An entry was edited in the visitor dashboard | Sync corrections |
| `invite_created` | An invite is created | Pre-register guests elsewhere |
| `invite_updated` | An invite is updated | Sync changes |
| `invite_removed` | An invite is deleted | Cancel downstream records |
| `upcoming_visit` | There is an upcoming visit | Prepare reception |
| `qr_code_sent` | The visitor receives their QR code email | Track invitee comms |
| `employee_invite_created` | An employee invite is created | Workplace planning |
| `employee_invite_updated` | An employee invite is updated | Workplace planning |
| `employee_upcoming_visit` | One hour before an employee is due on-site | Reminders |
| `employee_entry_sign_in` | An employee signs in | Occupancy, attendance |
| `employee_entry_sign_out` | An employee signs out | Occupancy, attendance |
| `employee_entry_blacklist_review` | An employee matched a blocklist rule and needs approval | Alert security |
| `employee_entry_blacklist_deny` | An employee was denied entry by a blocklist rule | Audit |
| `location_capacity_updated` | A location's capacity changed | Capacity dashboards |
| `desk_sign_in` | A desk is reserved and assigned (beta) | Desk analytics |
| `ticket_created` | A workplace issue is created via Envoy Mobile (beta) | Facilities routing |

## Event Payload Structure

```json
{
  "event": "entry_sign_in",
  "meta": {
    "location": { "id": "94082", "type": "locations", "attributes": { "name": "HQ", "time-zone": "America/Los_Angeles" } },
    "company": { "id": "75254", "type": "companies", "attributes": { "name": "Envoy" } }
  },
  "payload": {
    "id": "80078985",
    "type": "entries",
    "attributes": { "full-name": "John Doe", "email": "integrations@envoy.com", "signed-in-at": "2020-08-31 22:09:50 UTC" },
    "relationships": { "location": { "data": { "type": "locations", "id": "94082" } } }
  }
}
```

- `event` is the topic; `meta` has the location and company; `payload` is the
  entry, invite or other resource (JSON:API style, with kebab-case attribute names
  like `full-name`).
- Handle missing fields and unknown events: acknowledge with 200.

## Delivery and Retries

Envoy retries a webhook if your server does not return a 2xx: 5 times over about
10 minutes. Make handlers idempotent.

## Full Event Reference

See [Envoy's event types](https://developers.envoy.com/hub/reference/events) and
the [webhook setup guide](https://developers.envoy.com/hub/docs/create-webhooks).
