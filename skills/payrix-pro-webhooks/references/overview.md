# Payrix Pro Webhooks Overview

## What Are Payrix Pro Webhooks?

Payrix Pro is Worldpay's payment facilitation platform (not Payrix Payments). A webhook is set up
as an alert with one or more actions; an action has an Endpoint (your URL) and optionally a header
name and header value. When the alert fires, Payrix Pro calls the Endpoint and sends that header.

Requests are **not signed**. The only authentication is the secret header you add to each action.

## Which Alerts Can Fire?

Payrix's webhook documentation does not list event-type strings; you choose which alerts to create
in the Payrix Pro portal, and each trigger is a Resource and an Event chosen from dropdowns that
the docs don't enumerate. This skill therefore does not invent event names. Payrix's own example
is a new merchant's onboarding status changing from *Not Ready* to *Boarded*.

Give each webhook a single trigger and its own endpoint URL, so the URL tells your handler what
fired.

## Payload Structure

Not documented, and the action has its own format (Content-Type) setting, so the body may be JSON
or another format. Capture a delivery for each trigger before you write its parser. The examples parse JSON when the content type says so and otherwise keep the raw text.

## Method

The HTTP method is not documented. Accept GET, POST, PUT, PATCH and DELETE.

## Full Reference

See [Payrix's webhook documentation](https://resource.payrix.com/docs/set-up-webhooks).
