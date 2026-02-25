# Generated with: openclaw-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os
import hmac
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Query

load_dotenv()

app = FastAPI()

openclaw_secret = os.environ.get('OPENCLAW_HOOK_TOKEN')


def extract_token(auth_header, x_token):
    if x_token:
        return x_token
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None


def verify_openclaw_webhook(auth_header, x_token, secret):
    token = extract_token(auth_header, x_token)
    if not token or not secret:
        return False
    return hmac.compare_digest(token, secret)


@app.post('/webhooks/openclaw')
async def openclaw_agent_hook(request: Request, token: str = Query(None)):
    if token is not None:
        raise HTTPException(status_code=400, detail='Query-string tokens not accepted')

    auth_header = request.headers.get('authorization')
    x_token = request.headers.get('x-openclaw-token')

    if not verify_openclaw_webhook(auth_header, x_token, openclaw_secret):
        raise HTTPException(status_code=401, detail='Invalid token')

    payload = await request.json()
    message = payload.get('message')

    if not message:
        raise HTTPException(status_code=400, detail='message is required')

    hook_name = payload.get('name', 'OpenClaw')
    agent_id = payload.get('agentId')
    model = payload.get('model')

    print(f'[{hook_name}] Received agent hook')
    print(f'  message: {message}')
    if agent_id:
        print(f'  agentId: {agent_id}')
    if model:
        print(f'  model: {model}')

    return {'received': True}


@app.post('/webhooks/openclaw/wake')
async def openclaw_wake_hook(request: Request):
    auth_header = request.headers.get('authorization')
    x_token = request.headers.get('x-openclaw-token')

    if not verify_openclaw_webhook(auth_header, x_token, openclaw_secret):
        raise HTTPException(status_code=401, detail='Invalid token')

    payload = await request.json()
    text = payload.get('text')

    if not text:
        raise HTTPException(status_code=400, detail='text is required')

    mode = payload.get('mode', 'now')
    print(f'[Wake] {text} (mode: {mode})')

    return {'received': True}


@app.get('/health')
async def health():
    return {'status': 'ok'}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=3000)
