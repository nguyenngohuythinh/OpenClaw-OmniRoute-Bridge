# Phase 1 validation and runbook

## Checks performed

Linux container, Node v24.22.1, npm 11.9.0:

- `npm install`, `npm run build`, `npm start`: passed. The sandbox needed an npm cache under `/workspace/work/npm-cache` because its home cache is not writable; no machine/npm policy was changed.
- `npm test`: 19 passed, 0 failed, 1 Windows-only `.cmd` fixture skipped (20 total).
- Tests cover upstream config shape, provider/fallback/allowlist preservation, exact backup, validation failure before/after replacement, rollback, external edits, include refusal, config lock, CLI detection coalescing, start idempotency, serialized mutations, stop `--force`, optional restart failure, log redaction, API compatibility, bad key, malformed catalog, cache, origin/host protection, port-conflict classification and CLI timeout.
- `npm start` served the real dashboard and API on port 3000. Without installed services, `/api/system/health` returned Bridge online, `OPENCLAW_NOT_INSTALLED` and `OMNIROUTE_OFFLINE`; logs returned the explicit Bridge fallback.
- Chromium browser smoke: health rendering, password field, catalog selection, configure payload, diagnostic test, start result, logs, invalidating selection after endpoint edits, 390px mobile layout and no JavaScript errors. Configure/runtime/model responses in this browser test were intercepted fixtures; backend HTTP integration was exercised separately.
- `node --check src/public/js/dashboard.js` and `git diff --check`: passed.

No real API key or Gateway token was used. No live OpenClaw Gateway, provider inference, Windows service or upstream cloud account was changed.

## Required checks on Windows 10/11

CI matrix is supplied for Windows/Linux and Node 22/24; it has not been run remotely by this task. CI runs isolated fixtures, not a real scheduled task.

1. `npm.cmd install`, `npm.cmd run build`, `npm.cmd test`, `npm.cmd start`. The `.cmd` fixture should execute rather than skip.
2. With OpenClaw/OmniRoute stopped, verify dashboard codes; then run OmniRoute on its configured port.
3. Check valid/invalid keys. If models auth is disabled, verify the UI keeps key validity as unverified. A diagnostic inference test may cost money.
4. Use an onboarded OpenClaw config and installed Gateway service. Apply a catalog model, verify backup, `openclaw config validate --json`, and `openclaw models status` locally. Do not post unredacted config/output.
5. Start twice, stop, restart, inspect PID/reachability. Verify the service identity/profile matches the CLI environment. Test a port conflict and unavailable service account permissions.
6. Restart Bridge; verify the saved OmniRoute connection/model is detected. Logs should mask known config/environment keys and token patterns. Never share raw logs without reviewing them, especially arbitrary tool-generated text containing unfamiliar secrets.
7. Exercise `OPENCLAW_COMMAND` with a path containing spaces, `OPENCLAW_PROFILE`, `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH`. Confirm no ExecutionPolicy change is needed.

## Recovery

- `CONFIG_VALIDATION_FAILED`: original file is retained or restored. Run `openclaw config validate --json` locally to inspect detailed diagnostics.
- `CONFIG_CHANGED`: another writer modified the source; refresh before applying again.
- `CONFIG_BUSY`: another Bridge write may be active. A crash can leave `<config>.bridge.lock`; remove it only after confirming no Bridge configuration operation is running.
- `CONFIG_ROLLBACK_CONFLICT`: the file changed externally during validation; Bridge does not overwrite that edit. Restore/reconcile the adjacent UUID `.bak` using local OpenClaw tooling.
- `OPENCLAW_SERVICE_NOT_INSTALLED`: run `openclaw gateway install` after onboarding.
- `OPENCLAW_TIMEOUT` or `confirmed: false`: refresh status before retrying, since the service manager can continue an operation after its CLI client times out.
- A successful Apply with `restartError` means config is saved but restart needs attention.

Credentials and backups use mode 0600 on POSIX. Windows permissions inherit the destination user's directory ACL; this task did not exercise Windows ACL behavior. JSON5 comments/formatting are preserved in the backup; the new config is formatted JSON. Redaction covers known config/environment values and common credential formats, not every possible secret an arbitrary tool might print. No custom encryption or secrets store was introduced.

Phase 1 implementation is ready for local review. Real Windows/OpenClaw/OmniRoute acceptance remains pending; Chat and Agent Workspace remain deferred.
