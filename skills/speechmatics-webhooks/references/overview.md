# Speechmatics Webhooks Overview

## What Are Speechmatics Webhooks?

Speechmatics transcribes uploaded audio asynchronously through its batch API. Instead of
polling `GET /jobs/{id}`, add a `notification_config` to the job config. When the job is done
(or fails), Speechmatics sends an HTTP request to the URL you give it, optionally carrying the
transcript, the original media, or the job config. The docs call these "notifications"; they
are webhooks in practice.

Speechmatics does **not** sign these requests. You authenticate them with `auth_headers`, free-form
`Name: value` strings that Speechmatics adds to the request verbatim.

## Common Event Types

There is no event-type field. Speechmatics appends the job ID and an outcome to the URL query:

```
POST /callback?id=r6sr3jlzjj&status=success HTTP/1.1
User-Agent: Speechmatics-API/2.0
```

| `status` | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| `success` | The job was processed successfully | Store the transcript, trigger summaries or search indexing |
| `error` | Something went wrong with job processing (only `jobinfo` is sent) | Read the job's errors, alert, resubmit |
| `fetch_error` | Speechmatics failed to fetch a data file from a URL | Check the `fetch_data` URL and its access, resubmit |
| `trim_error` | Speechmatics failed to process the audio file before transcription | Check the audio file, re-encode, resubmit |

These values are not the same as the job status values returned by the jobs API.

## Event Payload Structure

The body is whatever `contents` you requested:

| Requested `contents` | Content-Type | Body |
|----------------------|--------------|------|
| exactly one of `transcript`, `transcript.json-v2`, `jobinfo` | `application/json` | the JSON itself |
| exactly one of `transcript.srt`, `transcript.txt` | `text/plain` | the SRT or text transcript |
| `data`, or two or more items | `multipart/form-data` | one part per item |
| none | none | empty body; only `id` and `status` in the query |

`contents` values: `transcript` / `transcript.json-v2` (JSON v2 transcript), `transcript.txt`,
`transcript.srt`, `data` (the submitted media) and `jobinfo` (the job config, also present in the
JSON v2 transcript). A callback with a single item sends that item as the raw request body
(useful for writing straight to an object store), so don't assume JSON.

## Delivery Behavior

- The method is `POST` unless the job sets `"method": "PUT"`.
- A job can list up to 3 URLs, and several notifications with different `contents`. They run in
  parallel and may complete in any order.
- If the response isn't 2xx, Speechmatics keeps retrying until its timeout. That includes `413`
  (body too large for your server) and `401`.
- Failures are recorded on the job: `GET /jobs/{id}` shows an `errors` array, and the transcript
  stays retrievable from the API.
- Deliveries come from published egress IPs per region (see [setup.md](setup.md)).

## Full Event Reference

See [Speechmatics' notifications documentation](https://docs.speechmatics.com/speech-to-text/batch/notifications).
