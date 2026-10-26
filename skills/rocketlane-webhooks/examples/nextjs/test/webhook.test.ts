import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/rocketlane/route';
import { parseBasicAuth, verifyRocketlaneRequest } from '../lib/verify-rocketlane';

const USERNAME = 'rocketlane';
const PASSWORD = 'p@ss:word/with+colon';

beforeAll(() => {
  process.env.ROCKETLANE_WEBHOOK_USERNAME = USERNAME;
  process.env.ROCKETLANE_WEBHOOK_PASSWORD = PASSWORD;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const basic = (user = USERNAME, pass = PASSWORD) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

// Shapes taken from Rocketlane's documented sample payloads (trimmed)
const taskCreated = {
  eventId: 'b6c68150-86f3-4a26-9a5f-66db5ca24b87',
  resourceType: 'TASK',
  eventType: 'TASK_CREATED',
  version: '1.0',
  data: { task: { taskId: 278, taskName: 'task2' } },
  eventOccurredAt: 1702266225732,
  eventTriggeredAt: 1702266229620,
};
const taskUpdated = {
  eventId: 'a3c7825b-9c89-42ac-8859-50e243d0c131',
  resourceType: 'TASK',
  eventType: 'TASK_UPDATED',
  version: '1.0',
  data: { task: { taskId: 318, taskName: 'Hire Chief Operating Officer' } },
  changeLog: {
    changedFields: ['taskName'],
    from: { taskName: 'Hire operations head' },
    to: { taskName: 'Hire Chief Operating Officer' },
  },
};

function makeRequest(
  authorization?: string,
  body: string = JSON.stringify(taskCreated),
  contentType = 'application/json'
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (authorization !== undefined) headers['Authorization'] = authorization;
  return new NextRequest('http://localhost:3000/webhooks/rocketlane', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Rocketlane webhook route', () => {
  it('accepts valid Basic credentials', async () => {
    const res = await POST(makeRequest(basic()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a lowercase scheme and a password containing colons', async () => {
    const res = await POST(makeRequest(basic().replace('Basic', 'basic'), JSON.stringify(taskUpdated)));
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await POST(makeRequest(basic(), JSON.stringify(taskCreated), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    expect((await POST(makeRequest(basic(USERNAME, 'nope')))).status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    expect((await POST(makeRequest(basic('someone', PASSWORD)))).status).toBe(401);
  });

  it('rejects a non-Basic scheme', async () => {
    expect((await POST(makeRequest(`Bearer ${PASSWORD}`))).status).toBe(401);
  });

  it('rejects valid credentials followed by junk', async () => {
    expect((await POST(makeRequest(`${basic()}!!!`))).status).toBe(401);
    expect((await POST(makeRequest(`${basic()} extra`))).status).toBe(401);
  });

  it('rejects credentials with no colon', async () => {
    const header = 'Basic ' + Buffer.from('rocketlane').toString('base64');
    expect((await POST(makeRequest(header))).status).toBe(401);
  });

  it('checks the credential before parsing the body', async () => {
    expect((await POST(makeRequest(basic('x', 'y'), 'not json'))).status).toBe(401);
  });

  it('returns 400 for invalid JSON with valid credentials', async () => {
    expect((await POST(makeRequest(basic(), 'not json'))).status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    expect((await POST(makeRequest(basic(), '[1,2]'))).status).toBe(400);
  });

  it.each(['TASK_DELETED', 'PROJECT_CREATED', 'PHASE_UPDATED', 'SOMETHING_NEW'])(
    'returns 200 for %s',
    async (eventType) => {
      const res = await POST(makeRequest(basic(), JSON.stringify({ ...taskCreated, eventType })));
      expect(res.status).toBe(200);
    }
  );
});

describe('verifyRocketlaneRequest', () => {
  it('fails closed when credentials are not configured', () => {
    const headers = new Headers({ Authorization: basic() });
    expect(verifyRocketlaneRequest(headers, {})).toBe(false);
    expect(
      verifyRocketlaneRequest(new Headers({ Authorization: basic('', '') }), {
        ROCKETLANE_WEBHOOK_USERNAME: '',
        ROCKETLANE_WEBHOOK_PASSWORD: '',
      })
    ).toBe(false);
  });

  it('handles non-ASCII credentials', () => {
    const config = { ROCKETLANE_WEBHOOK_USERNAME: 'usér', ROCKETLANE_WEBHOOK_PASSWORD: 'pässwörd' };
    expect(verifyRocketlaneRequest(new Headers({ Authorization: basic('usér', 'pässwörd') }), config)).toBe(true);
    expect(verifyRocketlaneRequest(new Headers({ Authorization: basic('usér', 'passwörd') }), config)).toBe(false);
  });
});

describe('parseBasicAuth', () => {
  it('splits on the first colon', () => {
    expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({ username: 'a', password: 'b:c' });
  });

  it('rejects malformed input', () => {
    expect(parseBasicAuth(null)).toBeNull();
    expect(parseBasicAuth('Basic')).toBeNull();
    expect(parseBasicAuth('Basic !!!!')).toBeNull();
    expect(parseBasicAuth('Basic abc')).toBeNull(); // length not a multiple of 4
  });
});
