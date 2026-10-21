# Motive Webhooks Overview

## What Are Motive Webhooks?

Motive (formerly KeepTruckin) is a fleet management platform. A company webhook sends an HTTP POST with a JSON body to your endpoint whenever a subscribed **action** happens in your fleet, for example a vehicle location update or a new fault code. Each webhook subscribes to a list of actions and has its own shared secret.

Motive also offers **Webhooks v2**, enabled per company on request through your Motive partner. It uses the same actions and payloads, but can deliver to AWS SQS or SNS (set the URL to the queue URL or topic ARN and assign a `webhook_type`) instead of an HTTP endpoint. This skill covers HTTP delivery with signature verification.

## Common Event Types

The `action` field names the event. The strings below are copied from Motive's docs.

| Action | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `vehicle_location_updated` | A location newer than the vehicle's current one is received | Live maps, ETA updates |
| `vehicle_location_received` | Any location is received, newest or not | Breadcrumb history |
| `vehicle_upserted` | A vehicle is created or updated | Sync the vehicle roster |
| `fault_code_opened` | A fault code opens on a vehicle | Maintenance alerts |
| `fault_code_closed` | A fault code closes | Close maintenance tickets |
| `user_upserted` | A user is created or updated (`trigger`: `created` or `updated`) | Sync drivers and admins |
| `inspection_report_upserted` | An inspection report is created or updated | DVIR workflows |
| `hos_violation_upserted` | An hours-of-service violation is created or updated | Compliance alerts |
| `vehicle_geofence_event` | A vehicle enters or exits a geofence | Arrival and departure tracking |
| `asset_geofence_event` | An asset enters or exits a geofence | Trailer tracking |
| `engine_toggle_event` | An engine is turned on or off | Usage and idling reports |
| `speeding_event_created`, `speeding_event_updated` | A speeding event is created or updated | Driver coaching |
| `driver_performance_event_created`, `driver_performance_event_updated` | A driver performance event is created or updated | Safety scoring |
| `user_duty_status_updated` | A driver's timecard status changes (v2 docs) | Payroll, duty status sync |
| `form_entry_upserted` | A driver dispatch form entry is created or updated | Dispatch workflows |
| `vehicle_gateway_disconnected`, `vehicle_gateway_disconnect_ended` | A vehicle gateway disconnects or reconnects | Device health |
| `dashcam_disconnected` | A dashcam disconnects | Device health |

Some of these appear in only one of the two docs pages (v1 or v2), and the v2 page lists the aggregated driver performance event without naming its actions. Check which ones your company can subscribe to.

## Event Payload Structure

The body is a single JSON object (not an array). Fields vary by action, but all carry `action`:

```json
{
  "action": "fault_code_opened",
  "trigger": "created",
  "id": 123,
  "code_description": "Cargo Securement",
  "status": "open",
  "first_observed_at": "2017-01-01T12:45:33Z",
  "code_label": "SPN-5610",
  "vehicle": { "id": 1, "number": "T123", "make": "Kenworth", "model": "379", "year": "2008", "vin": "ABC12345678909876" },
  "eld_device": { "id": 1, "identifier": "00000001", "model": "lbb-2" }
}
```

`vehicle_location_updated` carries `id`, `vehicle_id`, `vehicle_number`, `located_at`, `lat`, `lon`, `bearing`, `speed`, `odometer`, `type`, and more. Motive sends no event ID header, so de-duplicate on `action` plus the payload `id` (and a timestamp field such as `located_at` where the action has one).

## Delivery and Retries

| Response | Meaning |
|----------|---------|
| `200` or `201` | Processed; Motive will not retry |
| `403` | Signature could not be verified; Motive treats it as invalid and will not retry |
| Other `4xx` / `5xx`, or no response in 3 seconds | Retried after 1 minute, 1 hour, then 6 hours |

"It is up to the endpoint handler to ensure that requests are only processed once." Motive allows at most two active webhooks per action, and only one per action and URL.

## Full Event Reference

For the complete list of actions and payloads, see [Motive's webhooks documentation](https://developer.gomotive.com/docs/overview-company-webhooks) and the [Webhooks v2 overview](https://developer.gomotive.com/docs/webhooks-v2).
