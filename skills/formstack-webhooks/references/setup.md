# Setting Up Formstack Webhooks

## Prerequisites

- A Formstack Forms account with edit access to the form
- Your application's webhook endpoint URL (**HTTPS** — there is no replay protection, so
  don't send submissions over plaintext)
- For the API route: an OAuth2 access token or Personal Access Token for the Formstack
  v2025 API

## The First Step Is the HMAC Key

**Formstack will not send a signature at all unless an HMAC Key is configured on the
WebHook.** Signing is optional and off by default. Configure the key *before* you point
a form at your endpoint, so you never process an unsigned delivery.

There is **no account-wide webhook secret**. Each WebHook on each form has its own key.
The HMAC Key is **not** the V2 API application client secret, an access token, or a
Personal Access Token.

## Option 1: The Form Builder UI

**Form Settings → Emails & Actions → Advance Settings → Add Webhook**

(Or edit an existing WebHook.) This opens the **"Send Data to an External URL (WebHook)"**
action.

### Required

| Field | Notes |
|---|---|
| **URL Address** | Your endpoint. Use HTTPS. |

### Optional settings

| Field | What it does |
|---|---|
| **WebHook Name** | A label, so multiple WebHooks on one form are distinguishable |
| **Post using field IDs instead of field names** | Replaces field labels with numeric field IDs in the posted data |
| **Post with sub-field names** | `Name: Jane Smith` becomes `first = Jane last = Smith` |
| **Post with field type** | Appends `field_type = name` to each field's data |
| **Content Type** | URL Encoded Form Data (default) or JSON |
| **Custom HMAC Header** | *"If left blank, X-FS-Signature will be used as the HMAC header."* |
| **WebHook Shared Secret** | A static token (see below). Weaker than the HMAC Key |
| **HMAC Key** | **The signing key.** Set this |
| **Error Handling / error emails** | Comma-separated addresses notified when delivery fails |
| **Routing Logic** | Conditional filter deciding which submissions are sent at all |

The help article on the two secrets: *"Optionally, you may choose to enter a WebHook Shared
Secret or an HMAC Key. These are additional values you can send to your WebHook endpoint
which verifies that the data is from a trusted source if your endpoint requires this."*

### Choosing a field-key format

Pick **field IDs** if any two fields on the form could ever share a label — with the label
based formats, duplicate labels **collapse to the last occurrence** and you silently lose
data. See [overview.md](overview.md) for the documented example.

### Routing Logic

Click the **"Routing Logic"** link and build the filter. From the help article: *"Just like
all redirects, you can apply Routing Logic to your WebHook to filter which submissions are
sent to the WebHook based on how the Form is answered."*

This filters on the sender side. It is **not** an event-type subscription and your handler
sees no trace of it.

## Option 2: The v2025 API

Base URL: `https://www.formstack.com/api/v2025`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/forms/{formId}/webhooks` | List a form's WebHooks |
| `POST` | `/forms/{formId}/webhooks` | Create a WebHook |
| `GET` | `/forms/{formId}/webhooks/{webhookId}` | Retrieve one |
| `PUT` | `/forms/{formId}/webhooks/{webhookId}` | Update one |
| `DELETE` | `/forms/{formId}/webhooks/{webhookId}` | Delete one |
| `GET` | `/forms/{formId}/webhooks/openapi` | **Generated OpenAPI schema for that form's webhook payload** |

### Authentication (not the HMAC key)

OAuth2 or a **Personal Access Token**, sent as a bearer token. This credential manages
webhook configuration. It is a **completely separate secret** from the per-WebHook HMAC
Key that signs deliveries. Never put your access token in `hmacSecret`, and never use the
HMAC Key to call the API.

### Create a WebHook

```bash
curl -X POST "https://www.formstack.com/api/v2025/forms/$FORM_ID/webhooks" \
  -H "Authorization: Bearer $FORMSTACK_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Order intake",
    "url": "https://your-app.example.com/webhooks/formstack",
    "contentType": "json",
    "postDataFieldKeys": "field_ids",
    "fileTransferType": "downloadLink",
    "hmacSecret": "'"$FORMSTACK_HMAC_KEY"'",
    "customHmacHeader": null,
    "errorEmails": "alerts@example.com",
    "includeSubfieldNames": true,
    "includeFieldType": false,
    "standardizeValues": true
  }'
```

### Every webhook object field

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Name of the webhook |
| `url` | uri | URL to send the webhook data to |
| `contentType` | `urlencoded` \| `json` | Content type of the webhook data |
| `fileTransferType` | `downloadLink` \| `signedUrl` \| `base64encode` | Method for transferring file data in webhook payloads. `downloadLink` is the default; `base64encode` can make bodies very large |
| `postDataFieldKeys` | `field_names` \| `field_ids` \| `api_friendly_field_names` \| `internal_labels` \| `internal_labels_api_friendly` | Format of field keys in POST data. `field_names` is the default |
| `useFieldIds` | boolean | Legacy format toggle — "whether to use field IDs instead of field names". **Response-only**: it appears on the webhook object you read back, but is absent from the create/update request schema, so sending it may be rejected. Set `postDataFieldKeys: field_ids` instead |
| `sharedSecret` | string \| null | Shared secret for the webhook (the Handshake Key) |
| `hmacSecret` | string \| null | **HMAC secret used for signing webhook payload data** |
| `customHmacHeader` | string \| null | Custom HMAC header name. Blank → `X-FS-Signature` |
| `errorEmails` | string \| null | Comma-separated addresses notified when delivery fails |
| `includeFieldType` | boolean \| null | Include field type information in the webhook data |
| `includeSubfieldNames` | boolean \| null | Include subfield names in the webhook data |
| `standardizeValues` | boolean \| null | Standardize field values for consistency |
| `customerApprovedPciCompliant` | boolean \| null | Whether the webhook has been approved for PCI compliance |
| `logic` | object \| null | Routing Logic conditions for when to execute the webhook |

### Discover a form's payload schema

```bash
curl "https://www.formstack.com/api/v2025/forms/$FORM_ID/webhooks/openapi" \
  -H "Authorization: Bearer $FORMSTACK_ACCESS_TOKEN"
```

Returns an OpenAPI object schema for that form's webhook payload — `FormID`, `UniqueID`,
and the form's own field keys.

## Credit Card Data Requires HMAC + Error Emails

Formstack will not send **full credit-card data** over a webhook unless several extra
conditions are met. Per Formstack's
[Sending Full Credit Card data via Webhook](https://help.formstack.com/hc/en-us/articles/44593169354259-Sending-Full-Credit-Card-data-via-Webhook):

1. The endpoint URL must be **HTTPS** — required for credit-card data.
2. Tick **"Allow full credit card data to be sent through webhook"**.
3. Click **"I understand"** on the disclaimer accepting the risk of sending cardholder data
   to a PCI non-compliant server.
4. **Enable the HMAC Key setting** — required for credit-card data.
5. Add **at least one error email** under Error Handling — also required.

On the API object this corresponds to `hmacSecret`, `errorEmails` and the
`customerApprovedPciCompliant` acknowledgement.

Two things worth knowing before you debug a handler:

- **PCI-compliant webhooks may need enabling on your account.** If you are not already
  using Formstack to store credit-card information, you may have to ask Formstack Support
  to turn them on.
- **A failed delivery loses the card data.** Formstack: *"If the webhook fails, the
  submission will be stored in Formstack, but the credit card data will not be saved."*
  There is no way to re-fetch it afterwards, which is why the error email is mandatory.

If you are receiving payment fields and they look truncated or absent, check those settings
before debugging your handler.

## WebHook Shared Secret (Handshake Key)

A **static shared token** some endpoints require. Formstack's help centre also calls it a
Handshake Key and describes it as *"an additional value you can send to your WebHook
Endpoint that you may use to verify that the data is trustworthy, or at the very least that
the data is being sent from Formstack."* It is `sharedSecret` on the API object.

It is **bearer-style with no per-request binding** — it proves origin only as well as any
constant can, it is replayable, and it ends up in logs. **Prefer the HMAC Key.** Don't build
your primary verification path on it.

**It arrives as a body field named `HandshakeKey`**, after `FormID` and `UniqueID`, in
whichever content type the WebHook uses. Formstack's documentation doesn't name the field;
this is observed from real deliveries. Changing the HMAC Key did not change the
`HandshakeKey` value, so the field carries the Shared Secret, and the HMAC Key itself is
never sent. Compare it constant-time, and strip it from the submission before you store or
forward it.

## Firewall Allowlisting

The help article's troubleshooting section offers these outgoing IPs for allowlisting:

```
52.71.30.102
3.227.148.190
44.196.66.47
54.69.216.81
52.37.95.20
52.24.103.36
```

These are a **network-layer convenience** Formstack can change without notice. An IP match
is not authentication — keep verifying the HMAC.

## Testing Your Endpoint

Expose a local server and submit the form:

```bash
npx hookdeck-cli listen 3000 formstack --path /webhooks/formstack
```

No account required — the CLI creates a guest account on first run and gives you a public
HTTPS URL plus a web UI for inspecting requests. Paste the printed URL into the WebHook's
URL Address field, set the HMAC Key, then submit the form.

Use the Hookdeck UI to read the exact raw body and headers Formstack sent. That is the
fastest way to confirm your content type, field-key format, and metadata assumptions.

## Troubleshooting Setup

The help article's checklist, when nothing arrives:

- Does your endpoint require a Shared Secret? Check with whoever runs it.
- Can your endpoint accept the content type selected (URL Encoded Form Data vs JSON)?
- Can you allowlist the IPs above?
- Check `status.formstack.com` for WebHook service interruptions.

And, from the same article: if data still isn't arriving, *"either the data is not formatted
in a way that can be accepted by your endpoint, or your endpoint is not configured to
receive HTTP Requests."*

For signature problems specifically, see [verification.md](verification.md).
