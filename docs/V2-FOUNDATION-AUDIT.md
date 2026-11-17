# V2 Foundation audit and implementation plan

Audit: 2026-11-17. Bridge baseline: see `git merge-base HEAD origin/main`.
Upstream snapshots inspected (no upstream implementation copied):
- OpenClaw `f9004a169124bf639d7d03bbc917b35ec2709329`
- OmniRoute `8a8c64ee33b83803df74628a83f8372f7a1432c7`

## Findings

1. `src/index.ts` mixes boot, views, HTTP and service construction. Status blocks the event loop using `execSync` with no timeout.
2. Existing OpenClaw writes target `USERPROFILE/.openclaw/config.json` and a root `providers[]`. Upstream `src/config/paths.ts`, `state-dir.ts`, `zod-schema.core.ts` use `openclaw.json`, `models.providers.omniroute` and `agents.defaults.model.primary`. The old writer cannot configure current upstream. Do not silently migrate/delete the old file.
3. OmniRoute service makes two model requests per check, has no timeout, forwards upstream error text, and requires callers to include `/v1`. Normalize origin and `/v1` inputs; preserve the existing diagnostic completion endpoint.
4. Generated `.js` and declarations under services are committed and stale (the JS lacks testChat). Remove these so NodeNext imports resolve the built TypeScript consistently.
5. ESM `ts-node` startup and build asset paths are unreliable; `nodemon` is undeclared. Compile and run Node, serve source views/assets with explicit project-relative paths, and update the existing lockfile.
6. No tests, mutation serialization, validation/rollback, runtime control, log bounds, local-origin protection or credential-safe errors.

## Verified integration boundaries

- OpenClaw `src/cli/daemon-cli/register-service-commands.ts`: `gateway status --json --timeout`, `gateway start/stop/restart --json` (Stop also passes `--force`, required by the inspected CLI for noninteractive execution). Delegate platform service management to OpenClaw (Windows scheduled tasks, systemd/launchd); never kill arbitrary node.exe or spawn detached gateway copies. A configured OpenClaw service is required for lifecycle actions. No automatic service installation.
- `src/cli/daemon-cli/status.gather.ts`: project only `service.runtime.status/pid`, `rpc.ok`, `gateway.port`, config path; never return raw CLI output containing service environment/auth.
- `src/cli/config-cli.ts`: `config validate --json`, selectable through `OPENCLAW_CONFIG_PATH`. Validate a sibling candidate before replacement, then the installed file; preserve original bytes for rollback.
- `src/cli/logs-cli.ts`: `logs --limit --max-bytes --json`; use bounded CLI tail rather than guessing log locations.
- Gateway HTTP `/healthz` is liveness, `/readyz` readiness; authenticated CLI RPC status is the primary Phase 1 reachability signal. Later chat should use OpenClaw Gateway protocol, not OmniRoute completions.
- OmniRoute `next.config.*` rewrites `/v1/models` and `/v1/chat/completions` to `/api/v1/...`. `src/app/api/v1/models/route.ts` returns the OpenAI data catalog. `catalogRequest.ts` allows models auth to be disabled: a successful catalog request alone cannot prove key validity. UI/API must say `not_verified` in that case; a diagnostic model request provides an actual inference test, possibly billable.

## Planned files and sequence

Create `server.ts`, `config/bridge.config.ts`, `types/api.ts`, `types/openclaw.ts`, `types/omniroute.ts`; services for process, config, health, OpenClaw and OmniRoute; system/OpenClaw/OmniRoute routers; focused Node integration tests; dashboard JS; env example and runbook.
Modify `index.ts` to boot only, existing EJS/CSS for Phase 1 controls, package/tsconfig/start scripts, README and ignore rules. Remove only generated service artifacts and replace the two service implementations with focused modules.

Sequence: route split and health → cached async runtime detection → bounded OmniRoute catalog detection → verified backup/config transaction → serialized lifecycle controls and redacted logs → minimal dashboard and regression tests. Build each stage. Chat/agents/tasks and the full sidebar redesign stay deferred.

## Compatibility and limits

Preserve the four existing endpoint paths and successful response fields. Error responses gain stable `code` and `error`/`message`, with appropriate HTTP statuses. Correcting the upstream config schema is an intentional behavior fix. JSON5 is accepted; rewriting normalizes formatting, with exact original bytes in a protected backup. Config includes are refused rather than flattened. Named profiles are resolved through CLI `config file --json` rather than guessed. Credentials remain only in the existing OpenClaw config; POSIX mode 0600, Windows inherits the user directory ACL (no custom encryption). Real Windows and installed-service validation remains required in addition to Linux fixture tests.
