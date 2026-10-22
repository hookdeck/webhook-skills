# KoboToolbox Webhooks Overview

## What Are KoboToolbox Webhooks?

KoboToolbox calls its outbound webhooks **REST Services**. A project can link its data to other
servers or services you own: each time a new submission is created, KoboToolbox posts it to the
URL you registered. REST Services support JSON or XML formats and basic authentication, and can
send only a subset of fields.

Requests are not signed. Authentication is HTTP Basic: `Authorization: Basic
base64(username:password)` using the credentials entered on the REST Service.

## When Do They Fire?

- **On creation only.** Your data is sent to the external server only when a submission is
  created. Nothing is sent when data is edited.
- **Retries.** On failure the background task retries 3 times: after 60 seconds, 600 seconds and
  6,000 seconds. Email notifications can be enabled to receive a failure report.

## Event Types

There are none. KoboToolbox does not name events: every request is a new submission. If you need
to tell projects apart, use `_xform_id_string` (form ID) or a custom wrapper.

## Payload Structure

The body is the submission. In the default JSON format:

```json
{
  "_id": 1234,
  "_uuid": "1f4f1a52-3c1e-4d0b-9a55-0c1f0e2a7a11",
  "_submission_time": "2026-10-22T09:30:00",
  "_xform_id_string": "aXyZ123",
  "name": "Amina",
  "age": "34"
}
```

(Illustrative: question fields depend on your form; groups and repeat groups nest the keys.)

| Option | Effect |
|--------|--------|
| Type: JSON | Submission as a JSON object |
| Type: XML | Submission as the form's XML; the body is not JSON, so don't reject it |
| Subset of fields | Only the listed fields (plus metadata) are sent |
| Custom wrapper | JSON only: wrap the submission in a template of your own |

## Full Reference

See [KoboToolbox: Using the REST services](https://support.kobotoolbox.org/rest_services.html).
