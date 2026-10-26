# Datacake Webhooks Overview

## What Are Datacake Outgoing Webhooks?

Datacake is an IoT platform. Outgoing webhooks push real-time notifications from Datacake to your
app: Datacake sends a JSON payload over HTTPS (`POST`) to the endpoint URL you configure. Use them
to sync device measurements into your own database or to act on raw payload decoder output without
paying for storage.

Webhooks are configured per workspace under **Integrations > Webhooks**. They are **not signed**;
you add a secret header under **Headers** and verify it on your side (see
[verification.md](verification.md)).

## Common Event Types

You choose one or more events under **Events to send** on each webhook.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `device_measurement` | New measurement values are recorded in the database | Sync measurements to an external database |
| `decoder_output` | A payload decoder returns output | Act on raw decoder data that isn't stored, such as extra fields or console logs |
| `downlink` | A downlink is sent to a LoRaWAN or MQTT device, manually or by a rule | Audit or mirror downlinks |

## Event Payload Structure

Every body is `{ "event": "<name>", "data": ... }`. Dispatch on `event`.

`device_measurement`: `data` is an array. It holds only the fields inserted by the last message the
device sent, so a device that sends one field per MQTT message produces one row per webhook.

```json
{
  "event": "device_measurement",
  "data": [
    { "field": "TEMPERATURE", "value": 19.141228, "device": "f7384fd1-9e7f-4540-b4ed-5fa5810bcc27", "timestamp": 1647852981 }
  ]
}
```

`decoder_output`: `data.result` is the decoder's returned array (`field`, `value`, `device`;
`value` is omitted for fields the decoder returned empty). `data.log` is the console log and
`data.device` is device information on LoRaWAN and Particle types; both can be `null`. Decoders can
return extra information that Datacake itself ignores but your system can use.

```json
{
  "event": "decoder_output",
  "data": {
    "log": null,
    "device": null,
    "result": [{ "field": "PM25", "value": 4.88, "device": "dev:864475044240892" }],
    "product": "ef6275c7-3e9b-4134-9bef-24bc276a9592",
    "execution_time": 664535
  }
}
```

`downlink`:

```json
{
  "event": "downlink",
  "data": {
    "meta": { "type": "lorawan", "fport": 1, "downlink": "a6895656-8198-41fe-9c0e-f49074311190" },
    "device": "a52e6324-2cf9-4534-b523-819d94299414",
    "payload": "AQI=",
    "product_id": "4e8e8623-18c4-4798-9877-699058a00e24",
    "product_slug": "temperatur-dach"
  }
}
```

## Full Event Reference

For the complete reference, see [Datacake's outgoing webhooks documentation](https://docs.datacake.de/integrations/outgoing-webhooks).
The webhook list in Datacake also shows a seven-day request chart, the error rate, and the last
requests with your server's responses, which helps when debugging.
