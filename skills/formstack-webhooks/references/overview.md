# Formstack Webhooks Overview

## What Are Formstack Webhooks?

A **WebHook submit action** on a Formstack Forms form. In the form builder it is called
**"Send Data to an External URL (WebHook)"**. When someone submits the form, Formstack
makes one HTTP `POST` to the URL you configured, carrying that submission's answers.

From the help article: *"WebHooks are server to server communication connections that,
when added to your Form, allow you to send collected Form data to a third party service
through a URL."*

A form can have **multiple WebHooks**, each with its own URL, content type, field-key
format, secrets and Routing Logic.

### What this is not

| Product | Why it's out of scope |
|---|---|
| **Formstack Documents** (formerly WebMerge) | Separate product with its own "Webhook Delivery" feature. A captured delivery posted `merge_id`, `handshake`, `file_name` and a base64 `file_contents`, with a `WebMerge` user-agent, no signature header, and from an IP not on the Forms allowlist. Different payload entirely. |
| **Formstack Sign** (formerly InsureSign) | E-signature product, separate surface. |
| **Formstack Forms/Documents for Salesforce** | Salesforce-packaged products, separate surface. |
| **Typeform, Jotform, Formsite, Wufoo** | Different vendors. Never reuse their headers, payloads or event names here. |

## Why There Is No Event Type Table

Most provider skills have a "Common Event Types" table. **Formstack does not have one, and
inventing one would be a fabrication.**

A Formstack WebHook fires on exactly one thing: **a form submission**.

| What you might look for | Does it exist? |
|---|---|
| An event-type header (e.g. `X-Formstack-Event`) | **No** |
| An event-type body field (e.g. `event`, `type`) | **No** |
| Named event strings (`form.submitted`, `submission.created`, `form_submission`) | **No — these do not exist** |
| A subscribe-to-event-types model | **No** |
| Events for form edits, deletions, partial submissions | **No** (not via the WebHook submit action) |

### The only "routing" that exists: Routing Logic

Routing Logic is a **per-WebHook conditional filter on the submitted answers** that decides
whether a given submission is sent to that WebHook at all. The help article: *"Just like all
redirects, you can apply Routing Logic to your WebHook to filter which submissions are sent
to the WebHook based on how the Form is answered."*

Via the v2025 API it is a `logic` object:

```json
{
  "logic": {
    "action": "show",
    "conditional": "all",
    "checks": [
      { "field": "12345678", "condition": "equals", "option": "Enterprise" }
    ]
  }
}
```

- `action`: `show` | `hide`
- `conditional`: `all` | `any`
- `checks[].condition`: `equals` | `notequals` | `greaterthan` | `lessthan`
- `checks[].field` is a **field ID**; `checks[].option` is the value to compare against.

This is a *filter on the sender side*. Your handler never sees it and never sees an event
name.

## What Your Handler Should Dispatch On

**`FormID`.** One endpoint is commonly pointed at several forms, and the payload schema
differs per form, so the form identity is the only sane discriminator.

```javascript
const HANDLERS = {
  '1234567': handleContactForm,
  '7654321': handleOrderForm,
};

const handler = HANDLERS[String(fields.FormID)] ?? handleUnknownForm;
```

Always have a default branch, always return 2xx for an unrecognised form, and read every
key defensively — the shape is controlled by whoever edits the form, not by you.

## Payload Structure

### Transport

- Method: **HTTP POST**
- Content type: chosen per WebHook — **`application/x-www-form-urlencoded` (the default)**
  or `application/json` (API field `contentType`, enum `urlencoded` | `json`)

Handlers should support **both**, because the same endpoint is commonly reused across forms
configured by different people.

### Body

A **flat map of submitted field key → value**. The keys are **the form's own field labels**,
so there is no fixed schema — the payload differs per form.

urlencoded (default):

```
FormID=1234567&UniqueID=9876543210&Name=Jane+Smith&Email=jane%40example.com&Message=Hello
```

JSON:

```json
{
  "FormID": "1234567",
  "UniqueID": "9876543210",
  "Name": "Jane Smith",
  "Email": "jane@example.com",
  "Message": "Hello"
}
```

That JSON mirrors the example in the v2025 API reference's own
`WebhookOpenApiDefinitionDto` schema, whose `properties` example is
`{"FormID":{"type":"string"},"UniqueID":{"type":"string"},"Name":{"type":"string"},"Email":{"type":"string"},"Message":{"type":"string"}}`.

### Metadata keys — what is and isn't confirmed

| Key | Status | Use |
|---|---|---|
| `FormID` | In the API reference's example schema, and on every real delivery, as a **string** | Routing: which form produced this |
| `UniqueID` | In the API reference's example schema, and on every real delivery, as a **string** | Idempotency key |
| `HandshakeKey` | **Observed, not documented.** Carries the WebHook's Shared Secret. Seen only with one set, so its form without one is unknown | Optional static-token check. Strip before storing |

A real delivery from a form with no answer fields, exactly as it arrived on the wire:

```
FormID=6606394&UniqueID=1500878955&HandshakeKey=test
```

**Nothing else was seen.** There is no `Timestamp`, `FormName`, `SubmissionID` or similar
envelope key. Read every key with a default and tolerate absence.

## How to Know What Fields a Form Will Send

Ask Formstack. The v2025 API exposes a per-form endpoint that returns a generated OpenAPI
schema describing **that form's** webhook payload:

```
GET https://www.formstack.com/api/v2025/forms/{formId}/webhooks/openapi
```

This is the honest answer to "what fields will I get?" — better than guessing from a
sample delivery, because it covers fields a sample happened to leave blank.

## Field Key Format (`postDataFieldKeys`)

| Value | Keys look like | Notes |
|---|---|---|
| `field_names` | `Full Name:` | **Default.** Human labels. Duplicate labels collapse. |
| `field_ids` | `12345678` | Numeric, stable, **no collapsing**. The help article warns the key is "a number and not a human-readable text value". |
| `api_friendly_field_names` | `full_name` | Duplicate labels collapse. |
| `internal_labels` | Internal label text | |
| `internal_labels_api_friendly` | API-friendly internal label | |

A legacy boolean `useFieldIds` ("Post using field IDs instead of field names") is reported
back on the webhook object and means the same thing as `postDataFieldKeys: field_ids`. It is
**not settable** through the v2025 API — it appears in the webhook response schema but not
in the create/update request schema — so configure `postDataFieldKeys` instead.

### The duplicate-label footgun (documented)

From the help article, on `field_names`: *"ensure the form has only ONE usage of each field.
If you have multiple uses of one field type, for instance, 'short answer', 'name' or 'email',
then only the last occurrence of the field will be sent in the webhook."* And on API-friendly
keys: *"If you have multiple fields with the same label, regardless of the field type, then
only the last occurrence of the label will be sent over."*

Their worked example: two Name fields both labelled `Full Name:`, holding "Jane Doe" and
"John Doe" — **only "John Doe" arrives**.

**Use `field_ids` whenever labels might repeat.** Silent data loss is worse than ugly keys.

## Other Per-WebHook Shape Switches

| Setting | API field | Effect |
|---|---|---|
| Post with sub-field names | `includeSubfieldNames` | A Name field arrives as `first = Jane last = Smith` instead of `Jane Smith` |
| Post with field type | `includeFieldType` | Appends `field_type = name` to the field's data |
| Standardize values | `standardizeValues` | Normalises submitted values for consistency |
| File transfer type | `fileTransferType` | `downloadLink` (default), `signedUrl`, or `base64encode` |

`fileTransferType: base64encode` inlines uploaded files into the body — **bodies can become
very large**. Prefer `downloadLink` or `signedUrl` unless you specifically need the bytes
inline, and size your request-body limits accordingly if you don't.

## Replay and Idempotency

Nothing but the body is signed — **no timestamp, no nonce** — so a captured delivery
replays indefinitely. A staleness window is not possible here.

- Deduplicate on **`UniqueID`**, falling back to a hash of the raw body when it's absent.
- Serve the endpoint over **HTTPS only**.

## Delivery Behaviour

Documented:

- **Error emails** (`errorEmails`): comma-separated addresses notified when delivery fails.
- **PCI**: an HMAC Key **and** at least one error email are required before Formstack will
  send full credit-card data over a webhook, alongside a PCI acknowledgement
  (`customerApprovedPciCompliant`).
- **Source IPs** offered for firewall allowlisting: `52.71.30.102`, `3.227.148.190`,
  `44.196.66.47`, `54.69.216.81`, `52.37.95.20`, `52.24.103.36`. A firewall aid Formstack
  can change without notice — **not a verification mechanism**.
- **Status**: `status.formstack.com`.
- **Method is always POST.** Hookdeck's `FORMSTACK` source type treats the HTTP method as
  *managed* and fixes it to `POST`, so a Hookdeck source for Formstack will not accept
  another verb. Build the handler for POST only.

Observed on real deliveries but not documented:

- **User-Agent** `FormstackWebhook/1.0 (Form <FormID>)`. It names the form, but the format
  is not a published contract, so route on the `FormID` body field.
- **No other delivery headers** beyond `Content-Type`, `Content-Length`, the signature
  header and Datadog tracing headers (`tracestate`, `x-datadog-*`). There is no delivery-id
  or request-id header.
- Deliveries arrived from `44.196.66.47` and `52.71.30.102`, both on the published list.

Not documented and not observed — do not assert: retry counts, retry backoff or delivery
timeouts. Return 2xx fast and process asynchronously anyway.

## Full Reference

- [WebHook Submit Actions](https://help.formstack.com/hc/en-us/articles/44592535914387-WebHook-Submit-Actions) — the vendor help article
- [Formstack API reference](https://developers.formstack.com/reference) — v2025 webhook CRUD endpoints
