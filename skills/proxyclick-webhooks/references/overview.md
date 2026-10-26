# Proxyclick (Eptura Visitor) Webhooks Overview

## What Are Proxyclick Webhooks?

Proxyclick is now **Eptura Visitor**, a visitor management product. Its webhooks are automated
notifications that push information to another system when something happens in your account,
instead of you polling the API. Each notification is an HTTP `POST` to a destination URL you
configure, and the body is JSON.

Typical uses from Proxyclick's docs: show the visitors of the day on digital signage, send a
visitor's mobile number at check-in so a Wi-Fi system can text a code, send visit details to a
parking booking system, or push visitor pictures to a CRM.

Requests are **not signed**. The only security option is HTTP Basic authentication, with a
username and password you enter on the webhook. See [verification.md](verification.md).

## Common Event Types

Proxyclick documents six triggers. They are named only as labels in the webhook settings UI;
no event-type string is documented.

| Trigger (UI label) | Triggered When | Common Use Cases |
|--------------------|----------------|------------------|
| Visitor on-site | A visitor is on site | Digital signage, on-site headcount |
| Visitor check-in | A visitor checks in | Wi-Fi codes, notify the host |
| Visitor check-out | A visitor checks out | Revoke access, update headcount |
| Visit created | A visit is created (for example on preregistration) | Book parking |
| Visit updated | A visit is updated | Sync changes |
| Visit deleted | A visit is deleted | Cancel bookings |

Select at least one trigger when you add the webhook.

## Event Payload Structure

Proxyclick documents the payload as two attribute references: one for visitor check-in and
check-out, one for visit created, updated and deleted. Those reference pages were not reachable
when this skill was written, so **no event field is documented here**, and the examples use a
clearly labelled illustrative body and don't dispatch on any key.

Proxyclick states it only provides backward compatibility for attributes in its public
documentation, and recommends not relying on other keys that appear in the JSON. Capture a real
delivery (the Hookdeck CLI or a request bin such as Beeceptor, which Proxyclick itself suggests
for testing) and read the attribute reference before you depend on any field.

Because there is no documented event field, one way to tell triggers apart is to add a separate
webhook per trigger, each with its own destination URL. Confirm how Proxyclick treats paths and
query strings on your account before relying on that.

## Full Event Reference

See Proxyclick's [webhook documentation](https://knowledge.eptura.com/Visitor/Integrations/Proxyclick_APIs_and_webhooks/Send_info_from_Proxyclick_to_other_systems_using_webhooks).
