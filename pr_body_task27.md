## Summary
- add optional inbox filters for type and request_id in CLI command schemas and handlers
- extend db.checkMail to support recipient + optional type + optional payload.request_id filtering
- ensure consume mode marks only matched rows as consumed so filtered inbox/inbox-block calls do not consume unrelated mail

## Validation
- cd coordinator && npm test -- cli.test.js
- manual check: filtered consume removes only matching mail rows and leaves non-matching rows unconsumed
