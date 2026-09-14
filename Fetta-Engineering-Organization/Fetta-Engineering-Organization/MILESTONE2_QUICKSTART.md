# Milestone 2: Quick Start Guide

## What Was Built

Fetta now has a **real engineering workforce** that:
- ✅ Uses typed structured communication between agents
- ✅ Executes real verification commands (tsc, npm test, etc.)
- ✅ Persists every agent execution with evidence
- ✅ Validates file paths and command permissions
- ✅ Extracts useful engineering knowledge

**No simulation code remains.**

## Setup (5 minutes)

### 1. Update Database Schema
```bash
cd c:\Users\as\Downloads\Fetta-Engineering-Organization\Fetta-Engineering-Organization
pnpm --filter @workspace/db run push
```

This creates the new `agent_runs` table.

### 2. Verify TypeScript Compiles
```bash
# Check orchestrator-v2
cd artifacts/api-server
npx tsc --noEmit

# Should compile without errors (after schema push)
```

### 3. Start API Server
```bash
pnpm --filter @workspace/api-server run dev
```

## Testing (15 minutes)

### Acceptance Test: Add Health Endpoint

1. **Create Test Repository**
```bash
mkdir C:\temp\test-fetta
cd C:\temp\test-fetta
git init
npm init -y
echo "console.log('test');" > index.js
git add .
git commit -m "initial"
```

2. **Start Fetta UI** (if not running)
```bash
cd artifacts/fetta
$env:PORT="3000"; $env:BASE_PATH="/"; pnpm run dev
```

3. **Create Project** (via UI or API)
- Open http://localhost:3000
- Create project pointing to `C:\temp\test-fetta`

4. **Give Objective**
- Click "New objective"
- Enter: `"Add a GET /health endpoint that returns { status: 'ok' }"`
- Click "Send objective"

5. **Watch It Work**
- Coordinator analyzes
- Architect plans
- Engineer implements
- Test verifies

6. **Verify Results**
```bash
cd C:\temp\test-fetta
git status  # Should show new files
git diff    # Should show implementation
```

7. **Check Evidence** (via UI)
- Task should be "completed"
- Verification should be "passed"
- Agent runs should show 4 executions
- Memory should have useful entries

### Failure Test

**Objective**: `"Add a feature that breaks TypeScript compilation"`

**Expected**:
- Engineer creates code
- Test runs `tsc --noEmit`
- Exit code != 0
- Task status: `failed`
- Verification state: `failed`

## New API Endpoints

```bash
# List agent runs for a task
GET /api/projects/{projectId}/tasks/{taskId}/runs

# Get specific run details
GET /api/projects/{projectId}/runs/{runId}
```

## Architecture Changes

### Before (M1)
```
executeTask()
  ├─ runCoordinator() → string
  ├─ runArchitect() → string
  ├─ runBackend() → string
  └─ runTest() → string
```

### After (M2)
```
executeTaskV2()
  ├─ runCoordinator() → CoordinatorResult {action, targetAgent, plan}
  ├─ runArchitect() → ArchitectResult {findings, affectedFiles, implementationPlan, risks}
  ├─ runEngineer() → EngineerResult {filesModified, implementationDetails, commandsRun}
  └─ runTest() → TestResult {passed, evidence {command, exitCode, stdout}}
      └─ executeCommand("npx", ["tsc", "--noEmit"]) → REAL COMMAND
```

## Files Created

**Core** (8 new files):
1. `artifacts/api-server/src/lib/agent-types.ts` - Type definitions
2. `artifacts/api-server/src/lib/tool-executor.ts` - Command execution
3. `artifacts/api-server/src/lib/agents/coordinator.ts`
4. `artifacts/api-server/src/lib/agents/architect.ts`
5. `artifacts/api-server/src/lib/agents/engineer.ts`
6. `artifacts/api-server/src/lib/agents/test.ts`
7. `artifacts/api-server/src/lib/orchestrator-v2.ts`

**Modified** (2 files):
- `lib/db/src/schema/index.ts` (added agentRunsTable)
- `artifacts/api-server/src/routes/projects.ts` (uses orchestrator-v2, added endpoints)

**Docs** (3 files):
- `docs/MILESTONE2_PROGRESS.md`
- `docs/MILESTONE2_IMPLEMENTATION_SUMMARY.md`
- `MILESTONE2_QUICKSTART.md` (this file)

## Key Improvements

| Feature | Before | After |
|---------|--------|-------|
| Verification | Model says "looks good" | Runs `tsc --noEmit` |
| Evidence | Generic text | {command, exitCode, stdout} |
| Memory | "Task completed" | "Uses Express router pattern" |
| Safety | None | Path validation + permissions |
| Tracking | Events only | Agent runs with I/O |

## Troubleshooting

### "verificationEvidence does not exist"
Run: `pnpm --filter @workspace/db run push`

### TypeScript errors in orchestrator-v2
Make sure `agent-types.ts` and agent files are created

### Commands fail with permission error
Check `isCommandAllowed()` in `tool-executor.ts`

### Test agent always fails
Check that `npx` and `tsc` are available in PATH

### Files not written
Check logs - path validation may be rejecting writes

## What's Next

Remaining for M2 completion (~30 min):
1. Update OpenAPI spec with AgentRun schema
2. Run codegen
3. Complete acceptance test
4. Document results

Future Milestones:
- M3: Parallel agents, approval gates, streaming
- M4: Production deployment, git integration
- M5: Multi-project, worker isolation

## Quick Reference

**Key Types**:
- `CoordinatorResult` - Workflow decisions
- `ArchitectResult` - Implementation plans
- `EngineerResult` - Files modified
- `TestResult` - Verification evidence

**Key Functions**:
- `executeTaskV2()` - Main orchestration
- `executeCommand()` - Safe command runner
- `runVerification()` - Typecheck/test/build
- `extractLessons()` - Useful memory creation

**Key Tables**:
- `agent_runs` - Every agent execution
- `tasks` - Task lifecycle
- `memories` - Project knowledge
- `events` - Activity stream

## Success Criteria

You know it's working when:
- ✅ Task completes with real file changes
- ✅ `git diff` shows implementation
- ✅ Agent runs exist in database
- ✅ Evidence includes command + exit code
- ✅ Memory contains useful engineering info
- ✅ Failures actually fail (not fake pass)

**Fetta is now a real engineering workforce. 🎉**
