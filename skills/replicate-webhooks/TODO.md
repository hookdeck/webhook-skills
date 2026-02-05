# TODO - Known Issues and Improvements

*Last updated: 2026-02-04*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Resolved Issues

- [x] **Standard Webhooks reference**: Verification.md now correctly describes Replicate's "custom signature scheme" rather than Standard Webhooks
- [x] **Local development**: Uses Hookdeck CLI intentionally (provides webhook inspection UI and reliability features) - this is an intentional deviation from Replicate's ngrok recommendation
- [x] **Event payload structure**: Code correctly handles the prediction object directly without wrapper

## Notes

This skill intentionally recommends Hookdeck CLI for local development instead of ngrok because:
1. No account required for basic usage
2. Provides web UI for inspecting webhook requests
3. Consistent with other webhook skills in this repository

