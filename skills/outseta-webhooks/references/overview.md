# Outseta Webhooks Overview

## What Outseta Sends

Outseta combines membership, billing, CRM and email for SaaS businesses. Its webhooks are **notifications**: under **Settings > Notifications** you attach a callback URL to an activity, such as Person Login, and Outseta posts the related record to that URL when the activity happens.

## What's Documented

| Topic | Documented? |
|---|---|
| Signature | `x-hub-signature-256: sha256=<hex>`, HMAC-SHA256 of the raw body |
| Key | User-generated, "must be a 32-byte hex-encoded string", hex-decoded before use |
| Signing optional? | Yes: the header is added only once a Webhook Signature Key is configured |
| Timestamp | None in the scheme |
| HTTP method | Not stated in the signature article |
| Payload | Not shown in the signature article; each notification posts the related record |
| Test trigger | "One of the easier actions to trigger is Person Login" |

## Opt-in Signing

Outseta warns that an unsigned webhook URL "is open to the World Wide Web and could be used by anyone, not only Outseta", and that you "must configure a Webhook Signature Key" to prevent that. The examples always require a valid signature, so add the key before pointing a notification at them.

## Telling Activities Apart

Because the body is the record itself, it doesn't necessarily say which activity fired. Use one URL per activity (or a query string such as `?activity=person-login`) when one endpoint handles several.
