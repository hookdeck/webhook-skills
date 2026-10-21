import { NextRequest } from 'next/server';
import { seenSignatures, verifyHeliusAuth } from '../../../lib/helius';

interface HeliusTransaction {
  type?: string; // set on enhanced webhooks, absent on raw webhooks
  signature?: string; // Solana transaction signature
  description?: string;
  [key: string]: unknown;
}

function handleTransaction(tx: HeliusTransaction) {
  switch (tx.type) {
    case 'NFT_SALE':
      console.log('NFT sale:', tx.description);
      // TODO: record the sale, notify subscribers
      break;
    case 'SWAP':
      console.log('Swap:', tx.description);
      // TODO: update positions, trigger trading logic
      break;
    case 'TRANSFER':
      console.log('Transfer:', tx.description);
      // TODO: credit deposits, update balances
      break;
    default:
      console.log('Unhandled transaction type:', tx.type || 'RAW', tx.signature);
  }
}

export async function POST(request: NextRequest) {
  const expected = process.env.HELIUS_AUTH_HEADER;
  if (!expected) {
    return new Response('HELIUS_AUTH_HEADER is not configured', { status: 500 });
  }

  if (!verifyHeliusAuth(request.headers.get('authorization'), expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Parse only after the Authorization header has been checked
  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Helius delivers an array of transactions
  const transactions = Array.isArray(payload) ? payload : [payload];

  for (const tx of transactions as HeliusTransaction[]) {
    if (!tx || typeof tx !== 'object') continue;
    // Retries can redeliver the same transaction
    if (tx.signature) {
      if (seenSignatures.has(tx.signature)) continue;
      seenSignatures.add(tx.signature);
    }
    handleTransaction(tx);
  }

  // Acknowledge quickly; Helius expects a 200 within 1 second
  return new Response('OK', { status: 200 });
}
