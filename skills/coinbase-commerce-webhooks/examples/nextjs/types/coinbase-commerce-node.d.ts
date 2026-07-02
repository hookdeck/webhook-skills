// Minimal type shim for the untyped `coinbase-commerce-node` SDK.
declare module 'coinbase-commerce-node' {
  export const Webhook: {
    verifyEventBody(rawBody: string, signature: string, sharedSecret: string): any;
    verifySigHeader(rawBody: string, signature: string, sharedSecret: string): boolean;
    computeSignature(rawBody: string, sharedSecret: string): string;
  };
}
