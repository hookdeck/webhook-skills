const request = require('supertest');

// Set test environment variables before importing the app
process.env.INCODE_WEBHOOK_HEADER = 'X-Incode-Auth';
process.env.INCODE_WEBHOOK_SECRET = 'Bearer test_incode_secret_0123456789';

const app = require('../src/index');
const { verifyIncodeRequest, eventName } = require('../src/index');

const HEADER = process.env.INCODE_WEBHOOK_HEADER;
const SECRET = process.env.INCODE_WEBHOOK_SECRET;

// [payload field carrying the name, event name]
const EVENTS = [
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

function samplePayload(field = 'event_type', name = 'SESSION_SUCCEEDED') {
  return {
    [field]: name,
    interviewId: '664283755e0f8e1b87fcc2ce',
    clientId: 'MyClientId001',
    identityId: '65f8aa',
    interviewIds: ['664283755e0f8e1b87fcc2ce'],
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/incode')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Incode webhook endpoint', () => {
  describe('custom header authentication', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it('answers 200 with a JSON content type, as Incode requires', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty header value', async () => {
      const res = await post().set(HEADER, '');
      expect(res.status).toBe(401);
    });

    it('does not authenticate with a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', () => {
      expect(verifyIncodeRequest({ [HEADER.toLowerCase()]: SECRET }, '')).toBe(false);
      expect(verifyIncodeRequest({ [HEADER.toLowerCase()]: '' }, '')).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.INCODE_WEBHOOK_HEADER;
      try {
        expect(verifyIncodeRequest({ authorization: 'abc' }, 'abc')).toBe(true);
      } finally {
        process.env.INCODE_WEBHOOK_HEADER = HEADER;
      }
    });
  });

  describe('body handling', () => {
    it.each([['application/json'], ['text/plain'], ['application/x-www-form-urlencoded']])(
      'reads the body raw for content type %s',
      async (contentType) => {
        const res = await post(JSON.stringify(samplePayload()), contentType).set(HEADER, SECRET);
        expect(res.status).toBe(200);
      }
    );

    it('rejects invalid JSON', async () => {
      const res = await post('not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('rejects a JSON array', async () => {
      const res = await post('[]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: bad header and bad JSON is 401', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s = %s', async (field, name) => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(field, name))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(log).not.toHaveBeenCalledWith(expect.stringMatching(/^Unhandled event/));
      log.mockRestore();
    });

    it('reports unknown events as unhandled but still answers 200', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ event_type: 'SOMETHING_NEW' })).set(HEADER, SECRET);
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
