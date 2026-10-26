const request = require('supertest');

// Set test environment variables before importing the app
process.env.CONNECTEAM_WEBHOOK_SECRET = 'test_connecteam_secret_key_0123456789';

const app = require('../src/index');
const { verifyConnecteamRequest } = require('../src/index');

const SECRET = process.env.CONNECTEAM_WEBHOOK_SECRET;
const PATH = '/webhooks/connecteam';

// Payloads follow the documented samples (users, forms, time activity, scheduler, tasks, chat).
const PAYLOADS = {
  user_created: {
    requestId: 'ba973227-6f19-4e5f-8847-875147a05cb9',
    company: 'your_company_id',
    activityType: 'User',
    eventTimestamp: 1731595939,
    eventType: 'user_created',
    data: [{ userId: 9063791, firstName: 'John', lastName: 'Smith', email: 'john@example.com', isArchived: false }]
  },
  form_submission: {
    requestId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    company: 'your_company_id',
    activityType: 'forms',
    eventType: 'form_submission',
    eventTimestamp: 1736760013,
    data: { formSubmissionId: '5b43a76b1d41c85da1ff8b77', formId: 12345, submittingUserId: 9063791, answers: [] }
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
    webhookVersion: 1
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
    webhookVersion: 1
  },
  shift_created: {
    webhookVersion: 2,
    eventType: 'shift_created',
    requestId: 'b28d441c-e416-4c11-adb0-c8e0364ff29c',
    company: 'your_company_id',
    activityType: 'shift',
    eventTimestamp: 1736760013,
    schedulerId: 9454799,
    data: { shifts: [{ id: '6784dacb3c07733b0a849f49', title: 'Morning Shift', assignedUserIds: [9170357] }] }
  },
  task_completed: {
    requestId: 'c0ffee00-0000-4000-8000-000000000001',
    company: 'your_company_id',
    activityType: 'tasks',
    eventTimestamp: 1736760013,
    eventType: 'task_completed',
    data: { taskId: 'task-1' }
  },
  message_created: {
    requestId: 'c0ffee00-0000-4000-8000-000000000002',
    company: 'your_company_id',
    activityType: 'chat',
    eventTimestamp: 1736760013,
    eventType: 'message_created',
    data: { messageId: 'msg-1' }
  }
};

const EVENTS = [
  'user_created', 'user_updated', 'user_deleted', 'user_archived', 'user_restored',
  'user_promoted', 'user_demoted', 'form_submission', 'form_submission_edited',
  'manager_field_updated', 'clock_in', 'clock_out', 'auto_clock_out', 'admin_add',
  'admin_edit', 'admin_delete', 'user_timesheet_submitted', 'user_timesheet_unsubmitted',
  'user_timesheet_approved', 'user_timesheet_reopened', 'shift_created', 'shift_updated',
  'shift_deleted', 'availability_status_created', 'availability_status_deleted',
  'task_published', 'task_completed', 'message_created', 'message_updated',
  'message_deleted', 'conversation_created', 'conversation_updated', 'conversation_deleted'
];

function post(body = JSON.stringify(PAYLOADS.user_created), contentType = 'application/json') {
  return request(app).post(PATH).set('Content-Type', contentType).send(body);
}

describe('Connecteam webhook endpoint', () => {
  describe('x-webhook-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('x-webhook-secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('x-webhook-secret', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a prefix of the secret (whole value must match)', async () => {
      const res = await post().set('x-webhook-secret', SECRET.slice(0, -1));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty header', async () => {
      const res = await post().set('x-webhook-secret', '');
      expect(res.status).toBe(401);
    });

    it('rejects every request when the secret is not configured', () => {
      expect(verifyConnecteamRequest({ 'x-webhook-secret': SECRET }, '')).toBe(false);

      delete process.env.CONNECTEAM_WEBHOOK_SECRET;
      try {
        expect(verifyConnecteamRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      } finally {
        process.env.CONNECTEAM_WEBHOOK_SECRET = SECRET;
      }
    });

    it('checks the credential before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      it(`accepts ${method.toUpperCase()} with the secret and an empty body`, async () => {
        const res = await request(app)[method](PATH).set('x-webhook-secret', SECRET);
        expect(res.status).toBe(200);
      });

      it(`rejects ${method.toUpperCase()} without the secret`, async () => {
        const res = await request(app)[method](PATH);
        expect(res.status).toBe(401);
      });
    }

    it('accepts a PUT with a JSON body', async () => {
      const res = await request(app)
        .put(PATH)
        .set('Content-Type', 'application/json')
        .set('x-webhook-secret', SECRET)
        .send(JSON.stringify(PAYLOADS.user_created));
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body with any content type', async () => {
      const res = await post(JSON.stringify(PAYLOADS.user_created), 'text/plain').set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 200 for an empty body', async () => {
      const res = await post('').set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('{not json').set('x-webhook-secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[]').set('x-webhook-secret', SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('event handling', () => {
    for (const [name, payload] of Object.entries(PAYLOADS)) {
      it(`handles ${name} (documented payload shape)`, async () => {
        const res = await post(JSON.stringify(payload)).set('x-webhook-secret', SECRET);
        expect(res.status).toBe(200);
      });
    }

    it.each(EVENTS)('acknowledges %s', async (eventType) => {
      const res = await post(JSON.stringify({ ...PAYLOADS.user_created, eventType })).set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events', async () => {
      const res = await post(JSON.stringify({ ...PAYLOADS.user_created, eventType: 'something_new' })).set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
