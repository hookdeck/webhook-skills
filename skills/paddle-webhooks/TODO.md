# TODO - Known Issues and Improvements

*Last updated: 2026-02-04*

These items were identified during review. Most SDK-related issues have been fixed.

## Resolved Issues (2026-02-04)

- [x] **SDK verification method**: Fixed to use correct `paddle.webhooks.unmarshal(body, secret, signature)` for Node.js
- [x] **Python SDK pattern**: Updated to use `Verifier().verify(request, Secret(...))` pattern (note: FastAPI uses manual verification)
- [x] **Parameter order**: Fixed Node.js examples to use correct order `(body, secretKey, signature)`
- [x] **Documentation**: Updated verification.md with correct SDK examples

## Remaining Items

### Minor

- [ ] **FastAPI SDK support**: The Python SDK's `Verifier` class is designed for Flask/Django. Consider adding native FastAPI support in future.
- [ ] **Version constraints**: Consider tightening FastAPI version constraint from `>=0.100.0` to `>=0.128.0`

