# Setting Up Workspace ONE UEM Event Notifications

## Prerequisites

- A Workspace ONE UEM console account that can edit system settings
- A Workspace ONE UEM user name and password for the notification to send
- Your application's HTTPS endpoint URL (for local work, use the Hookdeck CLI below)

## Choose Your Credentials

The rule sends a **Workspace ONE UEM user name and password** as HTTP Basic auth. Use a
dedicated account with the least privilege that works, and store the pair as
`WORKSPACE_ONE_WEBHOOK_USERNAME` and `WORKSPACE_ONE_WEBHOOK_PASSWORD` in your endpoint's
environment. If you receive through Hookdeck, enter the same pair on the Workspace ONE source.

## Register Your Endpoint

1. In the UEM console go to **Groups & Settings > All Settings > System > Advanced > API > Event
   Notifications**.
2. Choose whether to inherit or override settings for the current organization group.
3. Select **Add Rule**.
4. Fill in:
   - **Target Name**: a label shown on the Event Notifications page
   - **Target URL**: your endpoint, e.g. `https://example.com/webhooks/workspace-one`
   - **User Name** and **Password / Confirm Password**: the credentials from above
   - **Format**: JSON or XML (the examples store either unparsed)
5. In the **Events** section, enable the events to send: Check-in/Check-out, Device Attribute
   Change (then pick the attributes), Device Compliance Status Change, Device Compromised Status
   Change, Device Delete, Device Enrollment, Device Unenrolled Enterprise Wipe, Device Wipe.
6. Save the rule.

For Check-in/Check-out, the device event severity level must be Information or above (All
Settings > Admin > Events).

## Check That Credentials Arrive

The Omnissa page doesn't say whether Basic credentials are sent on the first request or only after
a `401` challenge. Log the headers of a test notification to see what arrives.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 workspace-one --path /webhooks/workspace-one
```

Use the printed URL as the Target URL.

## Test Mode vs Live Mode

The page documents no test mode. Trigger a real event on a test device (for example enroll or wipe a lab
device) and inspect the delivery to learn the exact payload your tenant sends.
