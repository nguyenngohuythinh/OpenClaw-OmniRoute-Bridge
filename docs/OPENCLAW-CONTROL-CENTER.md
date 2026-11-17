# OpenClaw Control Center

Branch `feature/openclaw-control-center` builds on `feature/v2-foundation`, including the cross-site dashboard navigation fix. The new PR targets the foundation branch while PR #1 is unmerged. There is no Chat implementation or change to OmniRoute routes/service/provider logic.

## Behavior

- Four dashboard cards: Bridge, OpenClaw installation/version, Gateway reachability/port, Runtime Running/Stopped/unknown and PID. The runtime panel also shows CLI-selected config path and current model.
- Detection combines config/runtime snapshots deterministically. The Gateway-reported port takes precedence over the config port. Invalid ports and stale stopped-service PIDs are not presented as live values. Missing/unsupported/failed CLI states retain actionable errors rather than all becoming “not installed”.
- `GET /api/openclaw/status` and aggregate health keep existing fields and add `message`, `checkedAt`, `operation`. An active operation contains `action`, ISO `startedAt`, and `timeoutMs`. Polling tabs see live operation metadata even if the detection snapshot is cached.
- Runtime actions share the configuration mutation lock. Start is idempotent for a running process; Stop is idempotent for a stopped process. Unknown state blocks Start. No direct detached Gateway spawning or arbitrary Node process termination is introduced.
- Runtime deadline: 90 seconds across preflight, command and confirmation. Each lifecycle CLI command has a 45-second limit. Cancellation propagates through CLI/config reads; command cleanup is bounded to an additional 2.5 seconds. Windows ends the owned CLI process tree via taskkill, rather than unrelated Node/Gateway processes. The OpenClaw service manager can continue work after its CLI times out, so refresh before retrying.
- Busy metadata is cleared in `finally` on success, failure, preflight errors and timeout. Cache generations prevent a pre-action read from restoring stale post-action state.
- UI disables runtime buttons during an action, shows elapsed time, uses a 100-second HTTP timeout, and refreshes health after success or failure. Old in-flight health responses are discarded across actions. Another tab's active operation also disables runtime buttons until it completes or its advertised timeout expires.
- Health polling runs one request at a time and schedules the next poll 7 seconds after completion; hidden tabs use 45 seconds. Returning to a visible tab requests an immediate refresh. Network errors preserve previous values with an explicit stale-data message; polling recovers automatically.
- Logs retain the existing 1–500 line validation and bounded CLI output. UI adds refresh, optional automatic refresh, optional auto-scroll, source badge, update time, and distinct fallback messages. Log polling has its own non-overlapping scheduler, using the same active/hidden intervals.
- Redaction covers known config/environment credentials, remembered config secrets, structured sensitive JSON fields, bearer/basic auth, URL credentials and private key blocks. Arbitrary tool output can still contain unfamiliar secrets outside these formats; review any log before sharing it.
- Technical codes remain available in expandable details; primary errors are translated into Vietnamese guidance. Raw subprocess stderr is not sent to the frontend.

## Validation performed

Linux, Node 24.22.1:

- `npm run build`: passed.
- `npm test`: 37 passed, 0 failed, 1 Windows `.cmd` test skipped (38 total). Foundation regressions remain included.
- Tests cover action busy reset after CLI/timeout/invalid output, a real child-process cancellation under the whole-action deadline, Start/Stop/Restart, no-op responses, two-tab operation visibility via the health route, stale-cache invalidation, field projection/port precedence, log source/limit/redaction/fallback, poll response coalescing, hidden-tab intervals, recovery after errors and post-action refresh ordering.
- Chromium with fixture API responses: duplicate synthetic clicks while Start was pending produced one request; all runtime buttons stayed disabled until completion. Verified Start/Restart/Stop results, friendly timeout with technical details and enabled buttons, post-action health refresh, source/line bounds, auto-scroll versus preserved scroll, existing Phase 1 connection controls, desktop/390px layouts and no JS errors.

No live Windows scheduled task, installed Gateway or provider credentials were used. The inherited Windows/Linux Node 22/24 CI matrix runs on push; its remote results are separate from the local checks above.

## Windows acceptance

```powershell
git fetch origin
git switch feature/openclaw-control-center
git pull --ff-only
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd start
```

On an onboarded OpenClaw installation with Gateway service installed, verify PID/port/model/config path, repeated Start, Stop, Restart, background-tab polling and log source/masking. Check a stopped service, a bad command path and a port conflict; after each failure, confirm another action can run and there is no persistent OPENCLAW_BUSY. When testing a slow start/restart, wait for status to settle before retrying.

OmniRoute controls remain under Connections, and its aggregate health behavior is unchanged. An unavailable OmniRoute does not remove OpenClaw controls; its existing bounded health probe can add latency to the aggregate health response.
