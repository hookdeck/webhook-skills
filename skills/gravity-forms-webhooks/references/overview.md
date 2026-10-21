# Gravity Forms Webhooks Overview

## What Are Gravity Forms Webhooks?

The Gravity Forms **Webhooks Add-On** makes a remote HTTP request to an external service
when a form is submitted, "even when there is no official add-on available for it".
You set it up per form as a feed under **Form Settings → Webhooks**. Each feed has its
own URL, method, format, headers and body, so one form can call several services.

Gravity Forms does not sign webhooks. See [verification.md](verification.md).

## What Events Does Gravity Forms Send?

There are no event type strings. A feed runs on **form submission** only, and only when
its **Webhook Condition** (if enabled) matches. If conditions are disabled it runs for
every submission.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| form submission | A visitor submits the form and the feed's condition (if any) matches | Create a CRM lead, open a ticket, notify Slack, start a workflow |

## What Settings Does a Webhook Feed Have?

| Setting | What it does |
|---------|--------------|
| Name | Identifies the feed. Never displayed. |
| Request URL | Where to send the request. Supports merge tags (`{admin_ajax_url}`, `{rest_api_url}` for local requests). Must pass WordPress `wp_http_validate_url`. |
| Request Method | `GET`, `POST`, `PUT`, `PATCH` or `DELETE`. |
| Request Format | `FORM` (urlencoded) or `JSON`. |
| Request Headers | One or more HTTP headers sent with the request. **This is where the shared secret goes.** |
| Request Body | `All Fields` (the entire unformatted entry) or `Select Fields`. |
| Field Values | For `Select Fields`: key/value pairs from form fields, entry meta, or a custom value (merge tags allowed). |
| Webhook Condition | Run the feed only when conditions are met. |

`Content-Type` is set to `application/json` automatically when the format is `JSON` and
the method is `POST` or `PUT`. Feed processing aborts if the URL uses a custom port or
redirects to a URL that fails validation.

## What Does the Payload Look Like?

The body is the **entry**. Keys:

- **Field IDs**: `"1"`, `"2"`, ... one per field. Multi-input fields use a decimal
  sub-ID per input, e.g. `"3.3"` (first name) and `"3.6"` (last name) for a Name field.
- **Entry properties**: Gravity Forms entry fields such as `id`, `form_id`,
  `date_created`, `source_url`, `ip`, `created_by` and `status`. The webhook docs don't
  enumerate these; check a real delivery in the Hookdeck CLI inspector or your logs.

```json
{
  "id": "101",
  "form_id": "3",
  "date_created": "2026-10-21 10:15:30",
  "source_url": "https://example.com/contact/",
  "1": "Ada Lovelace",
  "2": "ada@example.com",
  "3.3": "Ada",
  "3.6": "Lovelace"
}
```

With `Select Fields` the body contains only the keys you defined. Map `id` and `form_id`
if you need to deduplicate or route by form.

Values are strings. With the `FORM` format, nested values may arrive in PHP bracket
notation (`key[0]`); the examples keep the flat key/value view.

## Full Reference

See the official
[Triggering Webhooks on Form Submissions](https://docs.gravityforms.com/triggering-webhooks-form-submissions/)
documentation.
