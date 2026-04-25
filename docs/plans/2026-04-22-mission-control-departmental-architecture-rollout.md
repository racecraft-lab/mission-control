---
up:
  - "[[Mission Control Departmental Architecture - Hub]]"
related:
  - "[[Mission Control Departmental Architecture - Technical Roadmap]]"
  - "[[Mission Control Departmental Architecture - PRD]]"
  - "[[Mission Control Departmental Architecture - Smoke Plan]]"
created: "2026-04-22"
tags:
  - mission-control
  - rollout
  - architecture
  - zero-regression
status: active
type: rollout-strategy
---

# Mission Control Departmental Architecture — Rollout

> [!waypoints] Hub » [[Mission Control Departmental Architecture - Hub|↑ Hub]] | [[Mission Control Departmental Architecture - Technical Roadmap|Technical Roadmap]] | [[Mission Control Departmental Architecture - Smoke Plan|Smoke Plan]]

Zero-regression migration plan, feature flag strategy, canary rollout path, and per-phase rollback procedures. Companion to the [[Mission Control Departmental Architecture - Technical Roadmap|Technical Roadmap]] — Roadmap is "what ships when," this note is "how it ships safely and how we back out."

## Core Principles

1. **Code ship ≠ behavior activation.** Every phase ships code to production fully guarded. Flipping a feature flag activates the behavior per product line, as a separate decision.
2. **Default OFF for every new flag.** Existing deployments see nothing until an operator explicitly enables a flag.
3. **Null-default for every new schema field.** Tasks without `template_slug` → no chain. Agents without `scope='global'` → workspace-scoped. Templates without `produces_pr` → treated as `false`. Etc.
4. **Dev-first, flag-scoped canary on live.** `~/mission-control` (`codex/openclaw-nodes-fallback`) is the dev worktree where changes are written and committed. `~/mission-control-sync` (`main`) IS the live service — it serves the compiled `.next/standalone` bundle that `next-server` (PID in `/proc/<n>/cwd`) runs from. The "canary" is NOT a separate environment; it's a feature flag flipped for ONE workspace (e.g., facility or a dedicated test workspace) on the live service, validated, then promoted to wider workspaces.
5. **Upstream compat checked on every PR** (see PRD §7, Roadmap upstream compat checklist).

## Feature Flag Inventory

| Flag | Default | Enables | Rollback |
|---|---|---|---|
| `FEATURE_WORKSPACE_SWITCHER` | OFF | Workspace switcher UI + `activeWorkspace` scoping | Flag OFF → switcher hidden, switcher-keyed panels revert to aggregate |
| `FEATURE_GLOBAL_AEGIS` | OFF | Aegis resolves globally via `scope='global'`; legacy workspace-Aegis is fallback | Flag OFF → `getAegis` resolves workspace-first (matches pre-refactor behavior) |
| `FEATURE_TASK_PIPELINES` | OFF | `advanceTaskChain` auto-creates successor tasks based on routing rules | Flag OFF → `advanceTaskChain` is a no-op; chain terminates at first task |
| `FEATURE_TWO_STEP_TERMINAL` | OFF | PR-producing tasks transition to `ready_for_owner` after Aegis | Flag OFF → direct `quality_review → done` for all tasks |
| `FEATURE_AREA_LABEL_ROUTING` | OFF | `pullFromGitHub` routes by `area:*` labels; `pushTaskToGitHub` emits them | Flag OFF → routing falls back to workspace inbox; label not emitted |
| `FEATURE_DISPOSITION_LOGGING` | OFF | Scheduler inserts into `task_dispositions` on triage completion | Flag OFF → INSERT is no-op; table remains |
| `PILOT_PRODUCT_LINE_A_E2E` | OFF | Product Line A pilot with all above flags activated | Flag OFF → fallback to Pattern 1 (explicit operator assignment) |

### Flag storage

Flags live in `workspaces.feature_flags JSON` (new column in Phase 0) — one column per workspace, per-product-line gating. Null = global defaults apply. Override stored as JSON dict of flag→bool.

Resolution order: request context → workspace flag → tenant default → hardcoded OFF.

## Operational Continuity on the OpenClaw Node (Per-Phase Live-Service Impact)

Verified OpenClaw node state (2026-04-22):

- `next-server` runs from `~/mission-control-sync/.next/standalone` → **sync worktree is live**.
- `openclaw-gateway` runs from `~/openclaw-release-publish-v2026.4.21.7` → **independent of MC worktrees**.
- DB: `~/mission-control/.data/mission-control.db` (shared across worktrees; auto-backed-up nightly at 03:00 UTC to `.data/backups/`).
- **Mission Control is user systemd-managed** via `mission-control.service` with `worktree.conf` pointing at `~/mission-control-sync`; OpenClaw gateway is independent. Restart MC with `systemctl --user restart mission-control.service` after deploy/build.

### Per-phase impact table

| Phase | Downtime | What happens |
|---|---|---|
| 0 Migrations | **~30–60s one restart** | Stop `mission-control.service` → run `pnpm run migrate` → start `mission-control.service`. M53/M54/M56/M57 are `ALTER TABLE ADD COLUMN`/`CREATE TABLE` (O(1)). M55 rebuilds `tasks.status` CHECK via swap-table (~1–2s lock on healthy task counts). M58 inserts one row. Gateway + docker agents unaffected. |
| 1 Switcher | **~30s one restart per deploy** | Flag OFF default ⇒ compiled code runs identically to pre-phase. |
| 2 Aegis refactor | **~30s one restart per deploy** | Flag OFF default ⇒ `getAegis` resolves workspace-first (byte-compatible with pre-refactor). In-flight Aegis reviews survive restart — persisted in `quality_reviews`. |
| 3 Pipeline engine | **~30s one restart per deploy** | Flag OFF ⇒ `advanceTaskChain` is a no-op. NULL-default template columns ⇒ existing tasks unaffected. |
| 4 ready_for_owner | **~30s one restart per deploy** | Flag OFF ⇒ scheduler transitions direct to `done`. New enum value in CHECK constraint but unused until flag ON. |
| 5 Area labels | **~30s one restart per deploy** | Flag OFF ⇒ sync ignores `area:*` labels; routing falls back to existing inbox behavior. |
| 6 Disposition log | **~30s one restart per deploy** | Flag OFF ⇒ INSERT is a no-op. Table exists but is quiet. |
| 7 Pilot | **Zero** | Pilot = flag-flips on already-deployed code; no build/restart. Live service keeps serving other workspaces while Product Line A workspace is piloted. |
| 8 Product Line B | **Zero for Product Line A** | Additive DB rows (new workspace, projects, templates) + new agent sandboxes provisioned via gateway. Gateway does NOT restart. Product Line A service path untouched. |

**Aggregate downtime across the entire rollout: ~3–4 minutes** split across ~8 restart windows over 7–8 weeks. Each window is a scheduled deploy, not an incident.

### What protects operational continuity

1. **Additive migrations + NULL-default fields.** Live pre-migration code reads new schema without errors (unknown columns ignored). New code reads old rows without errors (NULLs handled defensively in every reader).
2. **Flags default OFF.** Deploys land compiled code; behavior activates only when an operator flips the flag per-workspace.
3. **In-flight work survives restart.** The scheduler is a polling loop, not an in-memory queue. On restart it re-scans `tasks` and picks up where it left off.
4. **Gateway + agents decoupled from MC.** `openclaw-gateway` runs from its own release directory. Docker agent containers talk to the gateway, not directly to MC. MC restart does NOT kick agents.
5. **Nightly DB backups** at 03:00 UTC to `.data/backups/` provide a rollback floor for schema disasters (last 10 backups preserved).

### Before-migration checklist (Phase 0)

- [ ] Verify most-recent auto-backup exists: `ls -la ~/mission-control/.data/backups/ | tail -3`.
- [ ] Take an ad-hoc pre-migration snapshot: `sqlite3 ~/mission-control/.data/mission-control.db ".backup ~/mission-control/.data/backups/mc-pre-m53.db"`.
- [ ] Capture schema baseline: `sqlite3 ~/mission-control/.data/mission-control.db ".schema" > /tmp/schema-pre.txt`.
- [ ] Confirm no running long-writes: `lsof ~/mission-control/.data/mission-control.db` — expect only next-server.
- [ ] Confirm `mission-control.service` drop-ins still point at `~/mission-control-sync`, then relaunch cleanly with `systemctl --user restart mission-control.service` after migrations.

### Post-migration verification (Phase 0)

- [ ] `sqlite3 ~/mission-control/.data/mission-control.db "PRAGMA integrity_check;"` returns `ok`.
- [ ] `sqlite3 ~/mission-control/.data/mission-control.db "SELECT name, scope FROM agents WHERE scope='global';"` returns 3 rows.
- [ ] `sqlite3 ~/mission-control/.data/mission-control.db "SELECT slug FROM workspaces WHERE slug='facility';"` returns 1 row.
- [ ] Re-launch next-server; verify web UI at `:3000` loads.
- [ ] Verify gateway (PID unchanged) still responds on `:18789`.

## Canary Path (Per Phase)

```
┌────────────────────────────────────┐
│ 1. Merge PR to product-line-b/main  │
│    (flag OFF by default)           │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 2. Deploy to ~/mission-control-sync │
│    (canary, flag OFF)              │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 3. Verify no regression (24–48h)   │
│    — existing smoke suite passes   │
│    — no error log increase         │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 4. Enable flag on sync canary      │
│    (single workspace, e.g.         │
│    product-line-a)                    │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│ 5. Run phase-specific smoke        │
│    (see Smoke Plan)                │
└──────────────┬─────────────────────┘
               │
         pass? │      fail?
               ▼        │
┌─────────────────┐     │
│ 6. Promote to   │     ▼
│ ~/mission-      │  ┌─────────────────┐
│ control dev     │  │ Disable flag    │
│ worktree, flag  │  │ File incident   │
│ ON per product  │  │ Investigate     │
│ line            │  │ Retry           │
└─────────────────┘  └─────────────────┘
```

Phases 0, 2, 4, 5, 6 can each follow this canary path independently. Phase 1 requires a UI reload on enable. Phase 7 runs at the end of the canary chain as the integration validation.

## Migration Strategy (Phase 0)

### Pre-flight

Before running any M53–M58 migration:

1. Snapshot the live database: `cp ~/mission-control-sync/data/mission-control.db{,.pre-m53.bak}`.
2. Capture schema diff target: `sqlite3 mission-control.db '.schema' > schema-pre.txt`.
3. Run test suite on a clone of the snapshot to verify current baseline passes.

### Migration application

Run migrations in order on the sync worktree first:

```bash
ssh hal
cd ~/mission-control-sync
pnpm run migrate   # applies M53–M58 additively
```

Expected changes:

- `agents` gains `scope` column (M53); three rows backfilled to `global`.
- `agents.workspace_path` renamed to `agents.sandbox_path` (M54).
- `tasks.status` CHECK constraint rebuilt with `ready_for_owner` added (M55).
- `task_templates` gains 5 new nullable columns (M56).
- `task_dispositions` table created, index added (M57).
- `workspaces` gains one row: `('facility', 'Facility', 1)` (M58).

### Post-migration verification

```sql
-- Expect 3 rows
SELECT name, scope FROM agents WHERE scope='global';

-- Expect 1 row
SELECT slug FROM workspaces WHERE slug='facility';

-- Expect 5 new columns
PRAGMA table_info(task_templates);

-- Expect empty table, correct schema
SELECT * FROM task_dispositions LIMIT 1;
PRAGMA table_info(task_dispositions);
```

### Schema migration rollback

Each migration has a reverse script. Order is **reverse of apply**:

```sql
-- Rollback M58: delete facility workspace (only if no tasks reference it)
DELETE FROM workspaces WHERE slug='facility';

-- Rollback M57: drop task_dispositions
DROP TABLE IF EXISTS task_dispositions;

-- Rollback M56: drop the 5 new columns
-- (SQLite — use ALTER TABLE ... DROP COLUMN; available in 3.35+)

-- Rollback M55: rebuild CHECK constraint without ready_for_owner
-- (swap table pattern)

-- Rollback M54: rename back
ALTER TABLE agents RENAME COLUMN sandbox_path TO workspace_path;

-- Rollback M53: drop scope column
ALTER TABLE agents DROP COLUMN scope;
```

**Warning**: Phase 0 rollback is safe ONLY if no Phase 1–6 code is running against the new fields. Always disable feature flags BEFORE rolling back schema.

## Per-Phase Rollback

### Phase 1 (Switcher)

1. `UPDATE workspaces SET feature_flags = json_remove(feature_flags, '$.FEATURE_WORKSPACE_SWITCHER')`.
2. Reload the web UI. Switcher hidden. `activeWorkspace` reads return null. Filtered panels revert to aggregate.
3. No data loss. Zustand state ignored.

### Phase 2 (Aegis refactor)

1. Flip `FEATURE_GLOBAL_AEGIS` OFF.
2. `getAegis(ws)` resolves workspace-first as pre-refactor.
3. Existing legacy Aegis rows remain valid.
4. If rollback required due to refactor bug: revert the commit; `task-dispatch.ts` restored to pre-refactor state. Migration M53 stays (harmless).

### Phase 3 (Pipeline engine)

1. Flip `FEATURE_TASK_PIPELINES` OFF.
2. `advanceTaskChain` becomes no-op.
3. Existing in-flight chains freeze at their current state — parent tasks complete as usual (their own lifecycle unaffected), but successors are NOT created.
4. Operator may manually create follow-up tasks if urgency requires.

### Phase 4 (ready_for_owner)

1. Flip `FEATURE_TWO_STEP_TERMINAL` OFF.
2. Scheduler transitions directly `quality_review → done` for all tasks.
3. Tasks currently stuck in `ready_for_owner` must be manually transitioned. SQL:
   ```sql
   UPDATE tasks SET status='done' WHERE status='ready_for_owner' AND ...
   ```
4. Kanban column still renders, remains empty.

### Phase 5 (Area labels)

1. Flip `FEATURE_AREA_LABEL_ROUTING` OFF.
2. `pullFromGitHub` ignores `area:*` labels; new incoming issues route to workspace inbox.
3. `pushTaskToGitHub` stops emitting `area:*` labels; existing labels on GH remain (harmless).
4. Projects still have their `area_slug` values (if we added such a column); they just aren't used for routing.

### Phase 6 (Disposition logging)

1. Flip `FEATURE_DISPOSITION_LOGGING` OFF.
2. Scheduler INSERT becomes no-op.
3. Existing rows in `task_dispositions` remain and can be queried.
4. Audit panel disposition view shows empty results for current period.

### Phase 7 (Pilot)

1. Flip `PILOT_PRODUCT_LINE_A_E2E` OFF.
2. All dependent flags remain at their per-workspace settings.
3. Operator manually assigns tasks via Pattern 1 (explicit assignment).
4. Existing pilot tasks in flight: if chain is broken mid-flow, operator can (a) manually complete via UI, or (b) delete the task and re-create.

### Phase 8 (Product Line B)

1. `UPDATE workspaces SET disabled_at = CURRENT_TIMESTAMP WHERE slug = 'product-line-b'`.
2. Sync pauses (ignores disabled workspaces).
3. Agents remain running but no new work dispatched.
4. Product Line A unaffected.

## Upstream Merge Discipline

### Before every upstream fetch

```bash
cd ~/mission-control
git fetch builderz main
git log --oneline builderz/main ^main | head -30   # preview incoming
```

### Conflict-likely files (touch carefully in our PRs)

- `src/lib/migrations.ts` — additive only. Our M53+ go at the tail. Upstream's new migrations go **before** our block with a rebased number.
- `src/app/layout.tsx` — minimize our footprint; extend via Providers instead of modifying layout directly.
- `src/lib/auth.ts` — any change to workspace_id fallback resolution is a red flag. Log to Decisions if we touch it.
- `src/lib/task-dispatch.ts` — Phase 2 refactor touches this. Each upstream change must be manually reconciled.

### Every PR pre-merge

Run the upstream-compat checklist from the Technical Roadmap. Automate in CI where possible (a simple `git merge-tree` test against the last-known-good upstream sha).

## Incident Playbook

### "New behavior caused a regression"

1. Identify the phase's feature flag.
2. Flip it OFF for the affected workspace.
3. Verify regression clears.
4. Snapshot state: `sqlite3 .dump > incident.sql`.
5. File issue with repro steps.
6. Re-enable flag only after fix + smoke re-run.

### "Migration corrupted the database"

1. Halt MC service: `sudo systemctl stop mission-control`.
2. Restore from snapshot: `cp mission-control.db.pre-m53.bak mission-control.db`.
3. Restart service.
4. Open incident, do not re-run migration until root cause is known.

### "Aegis refactor broke quality reviews"

1. Flip `FEATURE_GLOBAL_AEGIS` OFF.
2. `getAegis` resolves workspace-first; existing Aegis reviews continue.
3. If global Aegis was the ONLY Aegis agent (no workspace-local): ensure an Aegis record exists for each active workspace as emergency fallback (insert rows, re-enable per-workspace lookup).

## Timeline (end-to-end ship + activate)

Assuming single-engineer full-time:

| Week | Phases active | State |
|---|---|---|
| 1 | Phase 0 | Migrations landed, flag scaffolding in place |
| 2 | Phase 0 + 1 | Switcher in canary with flag OFF |
| 3 | Phase 1 enabled; Phase 2 in-flight | Switcher live on sync worktree |
| 4 | Phase 2 enabled | Global Aegis active |
| 5 | Phase 3 in-flight | Pipeline engine code landing |
| 6 | Phase 3 enabled; Phase 4 in-flight | First pipeline runs on test templates |
| 7 | Phases 4 + 5 enabled; Phase 6 in-flight | Two-step terminal + area routing live |
| 8 | Phase 6 enabled; Phase 7 preparing | Disposition logging live |
| 9 | Phase 7 running (pilot) | Issue #110 end-to-end |
| 10 | Phase 7 success; Phase 8 preparing | Pilot validated; Product Line B onboarding begins |

Multi-engineer: Phases 1, 2, 5 can parallelize, compressing weeks 2–5.

## What "Done" Means for the Rollout

- All 8 phases shipped.
- All feature flags enabled on at least Product Line A workspace.
- Product Line A pilot smoke suite passing end-to-end.
- Product Line B onboarded within the < 1 hour scale target.
- Zero regressions on any single-workspace deployment running pre-change.
- Upstream cherry-pick test: next `builderz/main` cherry-pick applies without conflict.
