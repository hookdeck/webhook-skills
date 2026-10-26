# GOV.UK Notify Callbacks Overview

## What Are GOV.UK Notify Callbacks?

GOV.UK Notify can post JSON to a callback URL on your service when something happens to a message
you sent or received. You set the callback in **API integration > Callbacks**, providing a URL and
a bearer token. Notify sends the token as `Authorization: Bearer <token>` and the request method
is POST. Callbacks are not signed.

If a request fails, Notify retries every 5 minutes, up to 5 times.

## Callback Types

There is no `event` field. Tell the kinds apart by shape.

| Callback | Identifying fields | Triggered When | Common Use Cases |
|----------|--------------------|----------------|------------------|
| Delivery receipt | `status`, `notification_type` | An email or text message status changes | Track delivery, retry or alert on failures |
| Received text message | `source_number`, `destination_number`, `message` | A text message arrives at your Notify number | Handle replies |
| Returned letter | `notification_id`, `date_sent` | A letter you sent is returned | Flag a bad address |

Delivery receipt `status` values: `delivered`, `permanent-failure`, `temporary-failure`,
`technical-failure`. `notification_type` is `email` or `sms`.

## Payload Structure

The examples below are built from the documented field tables, not captured traffic.

Delivery receipt (all values strings except `template_version`; `reference`, `completed_at` and
`sent_at` may be `null`):

```json
{
  "id": "740e5834-3a29-46b4-9a6f-16142fde533a",
  "reference": "12345678",
  "to": "hello@gov.uk",
  "status": "delivered",
  "created_at": "2017-05-14T12:15:30.000000Z",
  "completed_at": "2017-05-14T12:15:30.000000Z",
  "sent_at": "2017-05-14T12:15:30.000000Z",
  "notification_type": "email",
  "template_id": "1d8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d10",
  "template_version": 1
}
```

Received text message (all values strings):

```json
{
  "id": "1e8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d11",
  "source_number": "447700912345",
  "destination_number": "07700987654",
  "message": "Hello Notify!",
  "date_received": "2017-05-14T12:15:30.000000Z"
}
```

Returned letter (`reference`, `sent_by`, `spreadsheet_file_name`, `spreadsheet_row_number` and
`upload_letter_file_name` may be `null`):

```json
{
  "notification_id": "2f8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d12",
  "reference": "12345678",
  "date_sent": "2017-05-14T12:15:30.000000Z",
  "sent_by": "hello@gov.uk",
  "template_name": "Template name",
  "template_id": "1d8b2b3c-0f4c-4a3e-9b53-7c5f2a1e8d10",
  "template_version": 1,
  "spreadsheet_file_name": "contact_list.csv",
  "spreadsheet_row_number": 2,
  "upload_letter_file_name": null
}
```

Delivery receipts work with test API keys, but not with smoke testing phone numbers or email
addresses.

## Full Reference

See [GOV.UK Notify's callback documentation](https://docs.notifications.service.gov.uk/rest-api.html).
