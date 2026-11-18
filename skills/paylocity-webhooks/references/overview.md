# Paylocity Webhooks Overview

## What Paylocity Sends

Paylocity's Webhooks API notifies your subscription URL when employee data changes in a company you have access to. It is **Early Access**: available only to approved participants, and Paylocity advises against relying on it in production unless explicitly authorized.

Event categories include personal information, assignment, status, pay rate, position, worked shift and pay type transaction changes. Examples named in the overview:

| Type | Meaning |
|---|---|
| `employee.assignment.v1` | An employee assignment changed |
| `employee.assignment.status.v1` | An assignment's status changed |

See Paylocity's Webhook Event Types page for the full list and each type's `data`.

## Payload

A CloudEvents-style envelope:

| Field | Meaning |
|---|---|
| `id` | Event ID. Use it to skip duplicates |
| `type` | Event type, such as `employee.assignment.v1` |
| `time` | When the event happened |
| `data` | Type-specific fields, including identifiers such as `companyId` and `assignmentId` (`assignmentId` equals the Employee ID) |

## Delivery

- **Method:** `POST` with a JSON body to your HTTPS `url`.
- **Headers:** `x-pcty-timestamp` and `x-pcty-signature`. See [verification.md](verification.md).
- **Response:** return `2xx` quickly and process asynchronously.
- **Retries:** unreachable endpoints (including timeouts) are retried for about 24 hours, with waits that roughly double from 1 minute. Paylocity-side errors are retried for up to 72 hours. `400`, `404`, `409`, `422` and `500` are **not** retried; return `503` to ask for a retry.
- **Unreachable:** a subscription that stays unreachable is marked `UNREACHABLE` and gets no events until it is fixed and re-verified.
- **Ordering:** best-effort. Delivery is at least once.

## Idempotency

Store each event `id` and ignore repeats.
