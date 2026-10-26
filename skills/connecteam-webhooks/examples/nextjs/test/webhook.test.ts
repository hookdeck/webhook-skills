import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/connecteam/route';
import { verifyConnecteamRequest } from '../lib/verify-connecteam';

const SECRET = 'test_connecteam_secret_key_0123456789';
const URL = 'http://localhost:3000/webhooks/connecteam';

beforeAll(() => {
  process.env.CONNECTEAM_WEBHOOK_SECRET = SECRET;
});

// Payloads follow the documented samples (users, forms, time activity, scheduler, tasks, chat).
const PAYLOADS: Record<string, object> = {
  user_created: {
    requestId: 'ba973227-6f19-4e5f-8847-875147a05cb9',
    company: 'your_company_id',
    activityType: 'User',
    eventTimestamp: 1731595939,
    eventType: 'user_created',
    data: [{ userId: 9063791, firstName: 'John', lastName: 'Smith', email: 'john@example.com', isArchived: false }],
  },
  form_submission: {
    requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    company: 'your_company_id',
    activityType: 'forms',
    eventType: 'form_submission',
    eventTimestamp: 1736760013,
    data: { formSubmissionId: '5b43a76b1d41c85da1ff8b77', formId: 12345, submittingUserId: 9063791, answers: [] },
  },
  // Time Activity payloads are flat: userId and timeClockId sit at the root.
  clock_in: {
    requestId: '550e8400-e29b-41d4-a716-446655440010',
    company: '123456',
    activityType: 'timesheet',
    eventTimestamp: 1786878000,
    eventType: 'clock_in',
    userId: 145,
    timeClockId: 67,
    webhookVersion: 1,
  },
  user_timesheet_approved: {
    requestId: '550e8400-e29b-41d4-a716-446655440011',
    company: '123456',
    activityType: 'timesheet_period',
    eventTimestamp: 1786878000,
    eventType: 'user_timesheet_approved',
    userId: 145,
    performedByUserId: 999,
    timeClockId: 67,
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    timezone: 'America/New_York',
    webhookVersion: 1,
  },
  shift_created: {
    webhookVersion: 2,
    eventType: 'shift_created',
    requestId: 'b28d441c-e416-4c11-adb0-c8e0364ff29c',
    company: 'your_company_id',
    activityType: 'shift',
    eventTimestamp: 1736760013,
    schedulerId: 9454799,
    data: { shifts: [{ id: '6784dacb3c07733b0a849f49', title: 'Morning Shift', assignedUserIds: [9170357] }] },
  },
  task_completed: {
    requestId: 'c0ffee00-0000-4000-8000-000000000001',
    company: 'your_company_id',
    activityType: 'tasks',
    eventTimestamp: 1736760013,
    eventType: 'task_completed',
    data: { taskId: 'task-1' },
  },
  message_created: {
    requestId: 'c0ffee00-0000-4000-8000-000000000002',
    company: 'your_company_id',
    activityType: 'chat',
    eventTimestamp: 1736760013,
    eventType: 'message_created',
    data: { messageId: 'msg-1' },
  },
};

const EVENTS = [
  'user_created', 'user_updated', 'user_deleted', 'user_archived', 'user_restored',
  'user_promoted', 'user_demoted', 'form_submission', 'form_submission_edited',
  'manager_field_updated', 'clock_in', 'clock_out', 'auto_clock_out', 'admin_add',
  'admin_edit', 'admin_delete', 'user_timesheet_submitted', 'user_timesheet_unsubmitted',
  'user_timesheet_approved', 'user_timesheet_reopened', 'shift_created', 'shift_updated',
  'shift_deleted', 'availability_status_created', 'availability_status_deleted',
  'task_published', 'task_completed', 'message_created', 'message_updated',
  'message_deleted', 'conversation_created', 'conversation_updated', 'conversation_deleted',
];

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(PAYLOADS.user_created),
  method = 'POST'
): NextRequest {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (body !== null && method !== 'GET') init.body = body;
  return new NextRequest(URL, init as ConstructorParameters<typeof NextRequest>[1]);
}

describe('/webhooks/connecteam', () => {
  describe('x-webhook-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a prefix of the secret (whole value must match)', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET.slice(0, -1) }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects an empty header', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': '' }));
      expect(res.status).toBe(401);
    });

    it('rejects every request when the secret is not configured', () => {
      const headers = new Headers({ 'x-webhook-secret': SECRET });
      expect(verifyConnecteamRequest(headers, '')).toBe(false);

      delete process.env.CONNECTEAM_WEBHOOK_SECRET;
      try {
        expect(verifyConnecteamRequest(headers)).toBe(false);
      } finally {
        process.env.CONNECTEAM_WEBHOOK_SECRET = SECRET;
      }
    });

    it('checks the credential before parsing the body', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    const handlers = { GET, POST, PUT, PATCH, DELETE };
    for (const [method, handler] of Object.entries(handlers)) {
      it(`accepts ${method} with the secret and an empty body`, async () => {
        const res = await handler(makeRequest({ 'x-webhook-secret': SECRET }, null, method));
        expect(res.status).toBe(200);
      });

      it(`rejects ${method} without the secret`, async () => {
        const res = await handler(makeRequest({}, null, method));
        expect(res.status).toBe(401);
      });
    }

    it('accepts a PUT with a JSON body', async () => {
      const res = await PUT(makeRequest({ 'x-webhook-secret': SECRET }, JSON.stringify(PAYLOADS.user_created), 'PUT'));
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body with any content type', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET, 'content-type': 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('returns 200 for an empty body', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }, ''));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }, '[]'));
      expect(res.status).toBe(400);
    });
  });

  describe('event handling', () => {
    for (const [name, payload] of Object.entries(PAYLOADS)) {
      it(`handles ${name} (documented payload shape)`, async () => {
        const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }, JSON.stringify(payload)));
        expect(res.status).toBe(200);
      });
    }

    it.each(EVENTS)('acknowledges %s', async (eventType) => {
      const body = JSON.stringify({ ...PAYLOADS.user_created, eventType });
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }, body));
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events', async () => {
      const body = JSON.stringify({ ...PAYLOADS.user_created, eventType: 'something_new' });
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }, body));
      expect(res.status).toBe(200);
    });
  });
});
