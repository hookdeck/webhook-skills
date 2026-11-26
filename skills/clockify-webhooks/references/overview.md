# Clockify Webhooks Overview

## What Clockify Sends

A JSON `POST` to the webhook's URL each time its event happens in the workspace, with:

- `Clockify-Signature`: the webhook's token
- `clockify-webhook-event-type`: the event name (documented for add-on webhooks)

The body is the affected object: a time entry, project, task, client, tag, user, invoice, approval request, time-off request, expense or assignment, depending on the event. There's no envelope and no event ID.

## Event Types

Each webhook watches one `webhookEvent`. Values in the API reference include:

- **Time entries:** `NEW_TIME_ENTRY`, `NEW_TIMER_STARTED`, `TIMER_STOPPED`, `TIME_ENTRY_UPDATED`, `TIME_ENTRY_DELETED`, `TIME_ENTRY_SPLIT`, `TIME_ENTRY_RESTORED`
- **Projects, tasks, clients, tags:** `NEW_PROJECT`, `PROJECT_UPDATED`, `PROJECT_DELETED`, `NEW_TASK`, `TASK_UPDATED`, `TASK_DELETED`, `NEW_CLIENT`, `CLIENT_UPDATED`, `CLIENT_DELETED`, `NEW_TAG`, `TAG_UPDATED`, `TAG_DELETED`
- **Users and groups:** `USER_JOINED_WORKSPACE`, `USER_DELETED_FROM_WORKSPACE`, `USER_DEACTIVATED_ON_WORKSPACE`, `USER_ACTIVATED_ON_WORKSPACE`, `USER_EMAIL_CHANGED`, `USER_UPDATED`, `USERS_INVITED_TO_WORKSPACE`, `USER_GROUP_CREATED`, `USER_GROUP_UPDATED`, `USER_GROUP_DELETED`
- **Invoices, approvals, time off, expenses, scheduling:** `NEW_INVOICE`, `INVOICE_UPDATED`, `NEW_APPROVAL_REQUEST`, `APPROVAL_REQUEST_STATUS_UPDATED`, `TIME_OFF_REQUESTED`, `TIME_OFF_REQUEST_APPROVED`, `TIME_OFF_REQUEST_REJECTED`, `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `ASSIGNMENT_CREATED`, `ASSIGNMENT_PUBLISHED`, and others

Some events need a paid plan. A webhook for an unsupported event can be created disabled.

## Retries

From Clockify's [help center](https://clockify.me/help/administration/api-webhook-settings): if your endpoint is unavailable, Clockify retries up to 4 times over 72 hours: 12 seconds after the failure, then 10 minutes later, 30 minutes later, and 72 hours later. Only 2xx responses count as succeeded. Each webhook's **Details** page lists attempts, and **Resend** redelivers any of them.

There's no event ID, so for idempotency key on the object's `id` plus the event and a timestamp field (for example `timeInterval.end` for a stopped timer).
