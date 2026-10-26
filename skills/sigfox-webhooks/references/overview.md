# Sigfox Webhooks Overview

## What Are Sigfox Webhooks?

Sigfox (now operated by UnaBiz) is a low-power IoT network. When a device message reaches the
Sigfox cloud, the backend can forward it to your server with a **custom callback** defined on
the device type. You choose the URL, HTTP method, headers and body template; Sigfox replaces
variables such as `{device}`, `{data}` and `{time}` and sends the request. Requests are not
signed, so authenticate them with a secret header you add to the callback (see
[verification.md](verification.md)).

## How Are Requests Shaped?

| Method | Where the variables go |
|--------|------------------------|
| `GET` | The query string, e.g. `?id={device}&time={time}&key1={data}`. No body. |
| `POST` / `PUT` | The body template, in `application/x-www-form-urlencoded` (default), `application/json` or `text/plain`. Variables in the URL query are appended to a form body. |

Also available: a `BATCH_URL` channel (`POST` only, one request per second, one line per message,
mandatory `batch={batch}` variable) and an `EMAIL` channel for testing. The examples cover the
`URL` channel. The example body used in the tests:

```json
{"device": "1A2B3C", "deviceTypeId": "5f3c8a1b", "time": 1700000000, "data": "0102030405", "seqNumber": 42}
```

## Callback Types

The callback type is **not** included in the request. The variables you put in the template
decide the shape, so the examples infer the type from the fields present.

| Callback type | Triggered When | Variables |
|---------------|----------------|-----------|
| `DATA UPLINK` | A message is received from a device | `time`, `deviceTypeId`, `device`, `data`, `seqNumber`, `rssi`, `station` |
| `DATA BIDIR` | An uplink asks for a downlink | Uplink variables plus `longPolling`, `ack`. Your response carries the downlink data |
| `DATA ADVANCED` | Message details are ready (about 30 s delay) | `device`, `time`, `data`, `seqNumber`, `lqi`, `linkQuality`, `duplicates`, ... |
| `SERVICE STATUS` | An out-of-band uplink reports battery and temperature | `time`, `device`, `batt`, `temp`, `snr`, `rssi`, `station` |
| `SERVICE ACKNOWLEDGE` | The network confirms a downlink | `time`, `device`, `infoCode`, `infoMessage`, `downlinkAck`, `downlinkOverusage` |
| `SERVICE REPEATER` | A repeater reports status | `time`, `device`, `batt`, `repeatedMsg`, `whitelistDevices`, ... |
| `ERROR` | A device breaches its keep-alive delay | `time`, `device`, `info`, `severity` (`ERROR`) |

Notes:

- `rssi`, `station` and `snr` need the NETWORK METADATA contract option.
- `SERVICE STATUS` is being retired: creation of new ones is disabled from September 2026 and the
  service is discontinued in April 2027.
- `device` and `deviceTypeId` are hexadecimal strings of up to 8 characters; `time` is epoch
  seconds; `data` is hexadecimal.

## Full Reference

See Sigfox's [custom callback creation](https://support.sigfox.com/docs/custom-callback-creation)
and [callback medium](https://support.sigfox.com/docs/callback-medium) documentation.
