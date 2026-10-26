import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/incode/route';
import { verifyIncodeRequest, eventName } from '../lib/verify-incode';

const HEADER = 'X-Incode-Auth';
const SECRET = 'Bearer test_incode_secret_0123456789';

// [payload field carrying the name, event name]
const EVENTS: Array<[string, string]> = [
  ['event_type', 'SESSION_STARTED'],
  ['event_type', 'SESSION_PROGRESS'],
  ['event_type', 'SESSION_SUCCEEDED'],
  ['event_type', 'SESSION_FAILED'],
  ['event_type', 'SESSION_PENDING_REVIEW'],
  ['eventType', 'IDENTITY_ENROLLED'],
  ['onboardingStatus', 'ID_VALIDATION_FINISHED'],
  ['onboardingStatus', 'ID_VALIDATION_FINISHED_SECOND_ID'],
  ['onboardingStatus', 'GOVERNMENT_VALIDATION_FINISHED'],
  ['onboardingStatus', 'FACE_VALIDATION_FINISHED'],
  ['onboardingStatus', 'POST_PROCESSING_FINISHED'],
  ['onboardingStatus', 'POST_PROCESSING_FINISHED_SECOND_ID'],
  ['onboardingStatus', 'ONBOARDING_FINISHED'],
  ['onboardingStatus', 'MANUAL_REVIEW_APPROVED'],
  ['onboardingStatus', 'MANUAL_REVIEW_REJECTED'],
  ['onboardingStatus', 'EXPIRED'],
  ['onboardingStatus', 'DELETED'],
];

beforeAll(() => {
  process.env.INCODE_WEBHOOK_HEADER = HEADER;
  process.env.INCODE_WEBHOOK_SECRET = SECRET;
});

function samplePayload(field = 'event_type', name = 'SESSION_SUCCEEDED') {
  return {
    [field]: name,
    interviewId: '664283755e0f8e1b87fcc2ce',
    clientId: 'MyClientId001',
    identityId: '65f8aa',
    interviewIds: ['664283755e0f8e1b87fcc2ce'],
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/incode', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/incode', () => {
  describe('custom header authentication', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it('answers 200 with a JSON content type, as Incode requires', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects an empty header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: '' }));
      expect(res.status).toBe(401);
    });

    it('does not authenticate with a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyIncodeRequest(headers, '')).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const headers = new Headers({ Authorization: 'abc' });
      expect(verifyIncodeRequest(headers, 'abc', 'Authorization')).toBe(true);
      expect(verifyIncodeRequest(headers, 'abc', HEADER)).toBe(false);
    });
  });

  describe('body handling', () => {
    it.each(['application/json', 'text/plain', 'application/x-www-form-urlencoded'])(
      'reads the body as text for content type %s',
      async (contentType) => {
        const res = await POST(
          makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), contentType)
        );
        expect(res.status).toBe(200);
      }
    );

    it('rejects invalid JSON', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('rejects a JSON array', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[]'));
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: bad header and bad JSON is 401', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s = %s', async (field, name) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(field, name)))
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(log).not.toHaveBeenCalledWith(expect.stringMatching(/^Unhandled event/));
      log.mockRestore();
    });

    it('reports unknown events as unhandled but still answers 200', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify({ event_type: 'SOMETHING_NEW' }))
      );
      expect(res.status).toBe(200);
      expect(log).toHaveBeenCalledWith('Unhandled event: SOMETHING_NEW');
      log.mockRestore();
    });
  });

  describe('eventName', () => {
    it('reads event_type, then eventType, then onboardingStatus', () => {
      expect(eventName({ event_type: 'A', eventType: 'B', onboardingStatus: 'C' })).toBe('A');
      expect(eventName({ eventType: 'B', onboardingStatus: 'C' })).toBe('B');
      expect(eventName({ onboardingStatus: 'C' })).toBe('C');
    });

    it('prefers event_type for session webhooks that also carry onboardingStatus', () => {
      expect(
        eventName({ event_type: 'SESSION_SUCCEEDED', onboardingStatus: 'ONBOARDING_FINISHED' })
      ).toBe('SESSION_SUCCEEDED');
    });
  });
});
