const request = require('supertest');

const USERNAME = 'rocketlane';
const PASSWORD = 'p@ss:word/with+colon';

process.env.ROCKETLANE_WEBHOOK_USERNAME = USERNAME;
process.env.ROCKETLANE_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');
const { verifyRocketlaneRequest, parseBasicAuth } = require('../src/index');

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

function post(body, authorization, contentType = 'application/json') {
  const req = request(app).post('/webhooks/rocketlane').set('Content-Type', contentType);
  if (authorization !== undefined) req.set('Authorization', authorization);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Rocketlane webhook endpoint', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts valid Basic credentials', async () => {
    const res = await post(taskCreated, basic());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a lowercase scheme and a password containing colons', async () => {
    const res = await post(taskUpdated, basic().replace('Basic', 'basic'));
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await post(taskCreated, basic(), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(taskCreated)).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    expect((await post(taskCreated, basic(USERNAME, 'nope'))).status).toBe(401);
  });

  it('rejects a wrong username', async () => {
    expect((await post(taskCreated, basic('someone', PASSWORD))).status).toBe(401);
  });

  it('rejects a non-Basic scheme', async () => {
    expect((await post(taskCreated, `Bearer ${PASSWORD}`)).status).toBe(401);
  });

  it('rejects valid credentials followed by junk', async () => {
    expect((await post(taskCreated, `${basic()}!!!`)).status).toBe(401);
    expect((await post(taskCreated, `${basic()} extra`)).status).toBe(401);
  });

  it('rejects credentials with no colon', async () => {
    const header = 'Basic ' + Buffer.from('rocketlane').toString('base64');
    expect((await post(taskCreated, header)).status).toBe(401);
  });

  it('checks the credential before parsing the body', async () => {
    expect((await post('not json', basic('x', 'y'))).status).toBe(401);
  });

  it('returns 400 for invalid JSON with valid credentials', async () => {
    expect((await post('not json', basic())).status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    expect((await post('[1,2]', basic())).status).toBe(400);
  });

  it.each(['TASK_DELETED', 'PROJECT_CREATED', 'PHASE_UPDATED', 'SOMETHING_NEW'])(
    'returns 200 for %s',
    async (eventType) => {
      const res = await post({ ...taskCreated, eventType }, basic());
      expect(res.status).toBe(200);
    }
  );
});

describe('verifyRocketlaneRequest', () => {
  it('fails closed when credentials are not configured', () => {
    expect(verifyRocketlaneRequest({ authorization: basic() }, {})).toBe(false);
    expect(
      verifyRocketlaneRequest(
        { authorization: basic('', '') },
        { ROCKETLANE_WEBHOOK_USERNAME: '', ROCKETLANE_WEBHOOK_PASSWORD: '' }
      )
    ).toBe(false);
  });

  it('handles non-ASCII credentials', () => {
    const config = { ROCKETLANE_WEBHOOK_USERNAME: 'usér', ROCKETLANE_WEBHOOK_PASSWORD: 'pässwörd' };
    expect(verifyRocketlaneRequest({ authorization: basic('usér', 'pässwörd') }, config)).toBe(true);
    expect(verifyRocketlaneRequest({ authorization: basic('usér', 'passwörd') }, config)).toBe(false);
  });
});

describe('parseBasicAuth', () => {
  it('splits on the first colon', () => {
    expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({ username: 'a', password: 'b:c' });
  });

  it('rejects malformed input', () => {
    expect(parseBasicAuth(undefined)).toBeNull();
    expect(parseBasicAuth('Basic')).toBeNull();
    expect(parseBasicAuth('Basic !!!!')).toBeNull();
    expect(parseBasicAuth('Basic abc')).toBeNull(); // length not a multiple of 4
  });
});
