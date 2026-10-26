# Form.io Webhooks Overview

## What Are Form.io Webhooks?

Form.io's **Webhook action** connects form submissions to other systems: it calls an external
API with a payload containing the submission data in real time. It is configured per form (or
resource) under **Actions**. Webhooks execute when a form is used; they do not fire while you
build or edit a form in the Developer Portal. The endpoint must be reachable from the Form.io
deployment's network.

Requests are not signed. The action can send HTTP Basic credentials (**Authorize User** /
**Authorize Password**), which is what this skill verifies.

## Request Methods and Operations

There is no event field. The HTTP method is the only hint of what happened. The action's
**Request Method** is one of Get, Post, Put, Delete, Patch; if set to **Match** (or blank), it
uses the method of the request that triggered it.

| Method (Match) | Operation | Common Use Cases |
|----------------|-----------|------------------|
| `POST` | Submission create | Create a record in a CRM or database |
| `PUT` | Submission update | Update the matching record |
| `DELETE` | Submission delete | Delete the matching record; `params` arrive as a query string |

If you pick a fixed method (for example POST for everything), every operation arrives with that
method and you cannot tell them apart without a **Transform Payload** script.

## Payload Structure

The default body is a JSON object:

| Field | Description |
|-------|-------------|
| `request` | The request body sent to the Form.io server (`data`, `state`, `form`, `project`, `metadata`, ...) |
| `response` | The response object (may be empty) |
| `submission` | The submission (`_id`, `data`, `state`, `form`, `created`, `modified`, ...) |
| `params` | URL and query parameters of the original request, such as `formId` |

Example (abridged from the docs, form with `textField` and `number`):

```json
{
  "request": { "data": { "textField": "Test value", "number": 12345, "submit": true }, "state": "submitted" },
  "submission": {
    "_id": "62e052a316f1ad4f786d4038",
    "data": { "textField": "Test value", "number": 12345, "submit": true },
    "state": "submitted",
    "form": "62a745944e836ccf1c0ba167"
  },
  "params": { "formId": "62a745944e836ccf1c0ba167" }
}
```

A **Transform Payload** script can replace the body entirely, so a customised action may send a
different shape. DELETE and GET requests may have an empty body.

## Other Behaviour

- **Forward Headers** forwards the headers received by the Form.io server to your endpoint.
- **Wait for Webhook Response** makes the submission wait for your response; errors then stop the
  submission and are shown to the form user.
- **Retry Request** retries a failed call (constant, linear, exponential or jitter delay).

## Full Reference

See [Form.io's Webhook Actions documentation](https://help.form.io/form-building/actions/webhook-actions).
