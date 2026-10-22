# Setting Up Sigfox Webhooks

## Prerequisites

- A Sigfox backend account with access to the device type that sends your messages
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 sigfox --path /webhooks/sigfox` locally)

## Choose Your Credential

Pick a long random value (for example `openssl rand -hex 32`). Sigfox forbids standard headers
except `Authorization`, so you can use either:

- `Authorization` with a value like `Bearer <random>` (the whole value is the secret), or
- any custom header name, e.g. `X-Sigfox-Token`, with the random value.

Store the header name as `SIGFOX_WEBHOOK_HEADER` (default `Authorization`) and the **exact whole
header value**, including any `Bearer ` prefix, as `SIGFOX_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In the Sigfox backend open **Device type**, click the device type, then **Callbacks**.
2. Click **New**, then **Custom Callback**.
3. Choose the callback type (Data > Uplink, Data > Bidir, Service, Error, ...).
4. Set **Channel** to `URL`.
5. Set the **URL pattern**, e.g. `https://example.com/webhooks/sigfox`. For `GET`, add the
   variables to the query string: `?id={device}&time={time}&data={data}`.
6. Choose the **HTTP method**: `GET`, `POST` or `PUT`. The example handlers accept all three.
7. For `POST`/`PUT`, set a content type and body template, e.g.
   `{"device":"{device}","data":"{data}","time":{time},"seqNumber":{seqNumber}}`.
8. In **Headers**, add your credential header (name and value from above). Header keys can't
   contain variables.
9. Leave **SNI** enabled, then save.

Use one callback (and ideally one URL path or query flag) per callback type, since the request
doesn't say which type sent it.

## Test

Replay a callback with curl:

```bash
curl -X POST http://localhost:3000/webhooks/sigfox \
  -H "Content-Type: application/json" \
  -H "Authorization: $SIGFOX_WEBHOOK_SECRET" \
  -d '{"device":"1A2B3C","deviceTypeId":"5f3c8a1b","time":1700000000,"data":"0102030405","seqNumber":42}'

curl "http://localhost:3000/webhooks/sigfox?device=1A2B3C&data=0102030405" \
  -H "Authorization: $SIGFOX_WEBHOOK_SECRET"
```

Then send a message from a device (or the Sigfox Network Emulator) and check the **Callback error
log** on the device type if nothing arrives.

## Alternative: Credentials in the URL

Sigfox also supports `http://login:password@yourdomain.com` URLs. That form isn't covered here;
don't combine it with an `Authorization` header.
