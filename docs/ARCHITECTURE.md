# OpenClaw OmniRoute Bridge — V2 Foundation

`index.ts` boots a loopback HTTP listener. `server.ts` constructs services, wires routers, protects local requests and handles credential-safe errors.

- `routes/system.routes.ts`: aggregate health.
- `routes/openclaw.routes.ts`: status, config, lifecycle and logs HTTP handlers.
- `routes/omniroute.routes.ts`: existing catalog/check and diagnostic model test.
- `services/process.service.ts`: async bounded CLI calls, timeout, own-child termination, Windows `.cmd` execution through cross-spawn. Raw stderr never reaches HTTP/logs.
- `services/config.service.ts`: CLI-selected config path, JSON5 parsing, include/symlink guards, exclusive lock, candidate validation, protected backup, atomic rename, post-write validation and rollback.
- `services/openclaw.service.ts`: projected/coalesced runtime detection, exclusive config/runtime mutations, service lifecycle and bounded log tail.
- `services/health.service.ts`: health aggregation using the latest successful test connection or saved provider/environment/default URL.
- `services/omniroute.service.ts`: normalized OpenAI API URL, 8-second network timeout, no redirects, 30-second bounded catalog cache, static error classification.
- `services/log.service.ts`: bounded operation metadata and runtime log redaction using known config/environment credentials and credential patterns.

The frontend displays actual OpenClaw model/runtime status and the monitored OmniRoute URL. Keys stay in a password input, transient request/connection memory, and the OpenClaw config after Apply. No browser persistent credential store. Apply preserves unrelated providers/model fallbacks and updates an existing model allowlist if one is configured.

The upstream CLI resolves profiles, config environment overrides, auth and platform services. Bridge does not implement an agent, a provider router, a native service installer or detached process supervisor. If lifecycle success cannot be verified, HTTP returns `confirmed: false` and the projected status rather than claiming success. Optional restart failure does not undo an already validated configuration.

A missing config must first be created by OpenClaw onboarding. Automatic migration from the legacy Bridge `config.json` writer is intentionally excluded. Files using `$include` need upstream config tooling. The write lock coordinates Bridge writers; an external editor does not honor it, so Bridge also checks original content before replacement and checks for conflicts before rollback.

Future chat belongs in a separate Gateway connector with OpenClaw sessions/streaming/events. `/api/omniroute/test` remains a diagnostic inference check only.
