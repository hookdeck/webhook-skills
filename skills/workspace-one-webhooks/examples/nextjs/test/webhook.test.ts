import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/workspace-one/route';
import { verifyWorkspaceOneRequest } from '../lib/verify-workspace-one';

const USER = 'ws1-notify';
const PASS = 'p@ss:word-with-colon';

const EVENTS = [
  'Check-in/Check-out', 'Device Attribute Change', 'Device Compliance Status Change',
  'Device Compromised Status Change', 'Device Delete', 'Device Enrollment',
  'Device Unenrolled Enterprise Wipe', 'Device Wipe',
];

beforeAll(() => {
  process.env.WORKSPACE_ONE_WEBHOOK_USERNAME = USER;
  process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD = PASS;
});

const basic = (user: string, pass: string) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

// Illustrative body: Omnissa's page does not document the payload.
function samplePayload(eventType = 'Device Enrollment') {
  return { EventType: eventType, DeviceId: 4821, EnrollmentUserName: 'jdoe' };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/workspace-one', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/workspace-one', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts a case-insensitive scheme and splits on the first colon', async () => {
      const header = 'bAsIc ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
      const res = await POST(makeRequest({ Authorization: header }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password', async () => {
      expect((await POST(makeRequest({ Authorization: basic(USER, 'wrong') }))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await POST(makeRequest({ Authorization: basic('someone-else', PASS) }))).status).toBe(401);
    });

    it('rejects a password truncated at its first colon', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS.split(':')[0]) }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await POST(makeRequest())).status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      expect((await POST(makeRequest({ Authorization: `Bearer ${PASS}` }))).status).toBe(401);
    });

    it('rejects malformed base64 and credentials without a colon', async () => {
      expect((await POST(makeRequest({ Authorization: 'Basic !!!not-base64!!!' }))).status).toBe(401);
      const noColon = 'Basic ' + Buffer.from('justausername').toString('base64');
      expect((await POST(makeRequest({ Authorization: noColon }))).status).toBe(401);
    });

    it('handles non-ASCII credentials without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: basic('usér', 'pässwörd') }));
      expect(res.status).toBe(401);
    });

    it('verifyWorkspaceOneRequest rejects when unconfigured', () => {
      const headers = new Headers({ authorization: basic(USER, PASS) });
      expect(verifyWorkspaceOneRequest(headers, '', '')).toBe(false);
      expect(verifyWorkspaceOneRequest(new Headers({ authorization: basic('', '') }), '', '')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload(eventType)))
      );
      expect(res.status).toBe(200);
    });

    it('accepts an unknown event type', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload('Something New')))
      );
      expect(res.status).toBe(200);
    });

    it('accepts an XML body', async () => {
      const xml = '<Event><EventType>Device Wipe</EventType><DeviceId>4821</DeviceId></Event>';
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, xml, 'application/xml'));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400 after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object JSON body with 400', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for an unauthenticated invalid body', async () => {
      expect((await POST(makeRequest({}, '{not json'))).status).toBe(401);
    });
  });
});
