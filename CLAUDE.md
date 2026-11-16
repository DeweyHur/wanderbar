# wanderbar

## Releasing the apps
- Every app release bumps the version in `apps/mobile/app.config.ts` (`version: "0.x.y"`), so Dewey can see an
  update arrived in Settings (it shows `v0.x.y (build) · commit`). New feature or module → minor (0.4.0 → 0.5.0);
  fixes only → patch (0.4.0 → 0.4.1). Bump it in the same change you ship, before running the builds.
- Builds: `gh workflow run mobile-android.yml --ref main -f play=true` (→ Play internal testing) and
  `gh workflow run mobile-ios.yml --ref main` (→ TestFlight).
- Update gate: apps older than `MIN_APP_VERSION` in `apps/api/src/lib/appGate.ts` get a full-screen "update"
  page (Play / TestFlight). Once BOTH new builds are actually available (Play upload done, TestFlight
  processed), raise `MIN_APP_VERSION` to the new version and push, so everyone moves to it. Never raise it
  before the builds are there: people would be sent to a store that has nothing newer.
- A change that needs a DB migration: push to a branch first, migrate production only when Dewey says so
  ("마이그레이션 해줘"), then merge to main.
