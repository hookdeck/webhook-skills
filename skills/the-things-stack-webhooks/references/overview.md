# The Things Stack Webhooks Overview

## What The Things Stack Sends

The Application Server sends one `POST` per application message to the webhook's Base URL, plus the path you set for that message type. The body is JSON when the webhook format is JSON (the Console default for custom webhooks). Requests aren't signed.

## Message Types

From [Data Formats](https://www.thethingsindustries.com/docs/integrations/data-formats/) and the Application Server source (`pkg/applicationserver/io/web`). Each request has exactly one of these top-level objects:

| Object | Console event type | Notes |
|---|---|---|
| `uplink_message` | Uplink message | `f_port`, `f_cnt`, `frm_payload` (base64), `decoded_payload`, `rx_metadata`, `settings`, `consumed_airtime`, `locations`, `version_ids`, `network_ids`, `attributes` |
| `uplink_normalized` | Uplink normalized | Normalized payload |
| `join_accept` | Join accept | `session_key_id`, `received_at` |
| `downlink_ack` / `downlink_nack` / `downlink_sent` / `downlink_queued` | Downlink events | `f_port`, `f_cnt`, `frm_payload`, `confirmed`, `priority` |
| `downlink_failed` | Downlink failed | The downlink and the error |
| `downlink_queue_invalidated` | Downlink queue invalidated | |
| `location_solved` | Location solved | |
| `service_data` | Service data | |

Around the object: `end_device_ids` (`device_id`, `application_ids.application_id`, `dev_eui`, `join_eui`, `dev_addr`), `correlation_ids`, `received_at`, and `simulated: true` on simulated messages. **Empty fields are omitted**: a value of `""`, `0` or `false` isn't present.

You can also set filter paths (for example `up.uplink_message`) so only those fields are pushed.

## Headers

| Header | Meaning |
|---|---|
| `Authorization` | `Basic base64(user:pass)` when Request authentication is on |
| `X-Downlink-Apikey` | The webhook's Downlink API key, if set. It can schedule downlinks: treat it as a secret |
| `X-Downlink-Push`, `X-Downlink-Replace` | URLs for pushing or replacing downlinks for this device (sent with the downlink key) |
| `X-Tts-Domain` | The deployment's domain |
| `Content-Type` | Set from the webhook format, for example `application/json` |

## Delivery, Timeouts and Retries

| Topic | Behaviour |
|---|---|
| Method | Always `POST` |
| Timeout | 5 seconds by default ([Troubleshooting](https://www.thethingsindustries.com/docs/integrations/webhooks/troubleshooting/)). The retries page gives 10 seconds per try. Both are deployment settings |
| Success | Any status from 200 to 299 |
| Retries, default | None: each request is tried at most once, so a request that fails while your endpoint is down is lost |
| Retries, with the Retries option | Needs The Things Stack Cloud Plus. 7 tries in total: 4 minutes after the first failure, 8 minutes after the second, then every 15 minutes, with 15% jitter |
| Failures | An `as.webhook.fail` event in the Console's Live data, with the status code and up to 1 KB of the response body |

Answer quickly and process in the background. Use `correlation_ids` (and `f_cnt` per device) to spot duplicates after retries.
