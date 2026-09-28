# Setting Up Grafana Webhooks

## Prerequisites

- A Grafana instance (self-hosted **Grafana 11+**, or Grafana Cloud) with permission
  to manage contact points.
- **Grafana 11.6 or later** for HMAC signing — the HMAC Signature subform was added in
  11.6 (grafana/grafana PR #100960). Earlier versions can send the webhook, but cannot
  sign it; use basic auth or a bearer token there instead.
- A publicly reachable HTTPS endpoint. For local development, see the Hookdeck CLI
  section below.

## Create the Webhook Contact Point

1. In Grafana, go to **Alerting → Contact points**.
2. Click **+ Add contact point**.
3. Give it a **Name** — this string is echoed back to you as the payload's `receiver`
   field, so make it something your handler can recognise.
4. Set **Integration** to **Webhook**.
5. Set **URL** to your endpoint, e.g. `https://example.com/webhooks/grafana`.
   The URL is stored in plain text, so don't embed secrets in the query string.
6. Expand **Optional Webhook settings** to reach everything below.
7. Click **Save contact point**.

### Route alerts to it

A contact point receives nothing until a notification policy points at it:
**Alerting → Notification policies** → edit the default policy or add a child policy
with a label matcher, and set **Contact point** to your webhook.

## Enable the HMAC Signature

Under **Optional Webhook settings → HMAC Signature**:

| Field | Required | Notes |
|-------|----------|-------|
| **Secret** | Yes | The shared secret. Used as-is (UTF-8 bytes) as the HMAC key — it is *not* base64-decoded and has no prefix. This is **not** a Grafana API key or service-account token; generate a long random string. |
| **Header** | No | Header to put the signature in. Defaults to `X-Grafana-Alerting-Signature`. |
| **Timestamp Header** | No | Header to put a Unix-seconds timestamp in. **No default name.** Leave empty and Grafana sends no timestamp and signs the body alone. |

Filling in **Secret** is what turns signing on — HMAC is off by default.

**Pick a timestamp header name** if you want replay protection; without one there is
no timestamp to check. Grafana's provisioning docs use
`X-Grafana-Alerting-Signature-Timestamp` as the example name, but any name works — it
is purely your choice, and your receiver must be configured with the same name.

### What gets signed

| Timestamp Header | Signed content |
|------------------|----------------|
| empty | the raw request body |
| set | `<unix-seconds>` + `":"` + raw request body |

HMAC-SHA256, lowercase hex, written bare into the signature header — no `sha256=`
prefix, no structured `t=...,v1=...` value.

## Other Optional Settings

| Setting | Effect |
|---------|--------|
| **HTTP Method** | `POST` (default) or `PUT`. |
| **Max Alerts** | Cap on alerts per notification; `0` = unlimited. Dropped alerts are counted in `truncatedAlerts`. |
| **Title** / **Message** | Go templates rendering the payload's `title` and `message`. |
| **Custom Payload** | Replaces the whole body with a template you write. The body may then be pretty-printed or non-JSON — verify raw bytes. |
| **Disable resolved message** | Stop sending `resolved` notifications. |
| **Extra Headers** | Static extra headers, including overriding the default `Content-Type: application/json`. `Authorization`, `User-Agent`, `Host` and similar are restricted. |
| **TLS** | CA certificate, client certificate and client key for mTLS. |

## Authentication Alternatives

These authenticate the *sender*; only HMAC protects the *payload*. HMAC can be
combined with either, but Basic auth and the Authorization header are mutually
exclusive.

**HTTP Basic Authentication** — set **Basic Authentication Username** and **Password**;
Grafana sends `Authorization: Basic base64(user:pass)`.

**Authorization Header** — set **Authentication Header Scheme** (defaults to `Bearer`)
and **Authentication Header Credentials**; Grafana sends
`Authorization: <scheme> <credentials>`.

Setting both is rejected at save time:

```
both HTTP Basic Authentication and Authorization Header are set, only 1 is permitted
```

Recent Grafana versions also expose an HTTP-client subform for OAuth2 client
credentials and proxy settings.

Compare any credential you receive in constant time, the same as the signature.

## Provisioning as Code

The provisioning key for the HMAC subform is `hmacConfig`:

```yaml
apiVersion: 1

contactPoints:
  - orgId: 1
    name: my-webhook
    receivers:
      - uid: my-webhook-uid
        type: webhook
        settings:
          url: https://example.com/webhooks/grafana
          httpMethod: POST
          hmacConfig:
            secret: ${GRAFANA_WEBHOOK_SECRET}
            header: X-Grafana-Alerting-Signature
            timestampHeader: X-Grafana-Alerting-Signature-Timestamp
```

Omit `timestampHeader` entirely for body-only signing. Omit `header` to use the
default `X-Grafana-Alerting-Signature`.

## Test It

Click **Test** on the contact point. Grafana sends a **normal, signed notification**
containing a synthetic alert:

- labels: `alertname: TestAlert`, `instance: Grafana`
- annotation: `summary: Notification test`

There is no separate handshake or challenge request, so your handler needs no special
case for it — it verifies exactly like a real notification.

Grafana treats any **2xx** response as success.

## Local Development

```bash
npx hookdeck-cli listen 3000 grafana --path /webhooks/grafana
```

(Use port `8000` for the FastAPI example.) The CLI prints a public URL — paste that
into the contact point's **URL** field. No account required; the CLI creates a guest
account on first run and gives you a web UI for inspecting and replaying requests.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| No signature header arrives | **Secret** is empty — HMAC is off. Or you're on Grafana < 11.6. |
| Signature header has an unexpected name | The **Header** field was customised. Read the name from config, don't hard-code it. |
| No timestamp header arrives | **Timestamp Header** is empty — Grafana is signing the body alone. |
| Never receive `resolved` | **Disable resolved message** is on. |
| Fewer alerts than expected | **Max Alerts** truncated them; check `truncatedAlerts`. |
| Body isn't the documented shape | **Custom Payload** is set. |
