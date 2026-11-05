# Workspace ONE UEM Event Notifications Overview

## What Are Workspace ONE Event Notifications?

Workspace ONE UEM (Omnissa, formerly VMware AirWatch) can push an HTTP callback to your
endpoint when a device event happens. You define each callback as a rule under **Event
Notifications** in System Settings: a Target Name, a Target URL, a User Name, a Password, a
Format (JSON or XML) and the events that trigger it.

The notifications are **unsigned**. Workspace ONE authenticates with HTTP Basic auth, using the
User Name and Password on the rule. This skill covers Event Notifications only, not the REST
API or other Omnissa products.

## Common Event Types

These are the notification events listed on the Omnissa page, by their UI labels:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Check-in/Check-out` | A multi-user device is checked in or out (device event severity must be Information or above) | Shared-device tracking |
| `Device Attribute Change` | A selected attribute changes: Asset Number, Device Friendly Name, Device MCC, Ownership, Organization Group ID, Operating System, Phone Number, User Email Address | Inventory and CMDB sync |
| `Device Compliance Status Change` | A device's compliance status changes | Revoke access, open a ticket |
| `Device Compromised Status Change` | An Android device is rooted or an iOS device is jailbroken | Security alerts |
| `Device Delete` | A device is deleted from Workspace ONE UEM | Remove records downstream |
| `Device Enrollment` | A device enrolls into Workspace ONE Intelligent Hub or Workspace ONE UEM | Onboarding automation |
| `Device Unenrolled Enterprise Wipe` | A device is enterprise wiped | Offboarding, asset recovery |
| `Device Wipe` | A device is wiped | Offboarding, audit logs |

## Event Payload Structure

**The Omnissa page does not document a payload.** Older versions of the page (2406 and earlier)
point to an "AirWatch API Event Notification Guide" on docs.omnissa.com, but the SaaS and 2410
versions no longer do, and we couldn't find the guide. The examples in this skill store the raw
body and don't read any field. Capture a real delivery from your tenant and write your parser
from it.

## Full Event Reference

See Omnissa's [Event Notifications System Settings](https://docs.omnissa.com/SystemSettings-VSaaS/EventNotificationsSystemSettings)
page.
