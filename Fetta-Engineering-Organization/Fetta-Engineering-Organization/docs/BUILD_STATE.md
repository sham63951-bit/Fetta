# Fetta build state

Updated: September 13, 2026

## Shipped vertical slice

Fetta now has a working repository-centered organization view backed by the shared API server and PostgreSQL:

- The active repository is initialized and deterministically scanned for language, framework, package manager, branch, and Git state.
- The Project Brain persists facts, conventions, constraints, and lessons.
- Seven specialist agents are persisted per project with visible runtime states.
- Engineering objectives can be created, run through a Coordinator → Architect → Backend → Test pass, and marked with verification evidence.
- Task lifecycle, activity events, and verification results are persisted and visible in the web UI.
- The web artifact includes Organization, Task detail, Project Brain, Repository, and Settings routes.

## Runtime

- Web artifact: `artifacts/fetta`
- API artifact: `artifacts/api-server`
- API base path: `/api`
- Development database: PostgreSQL through `@workspace/db`
- API contract: `lib/api-spec/openapi.yaml`

## Deliberate MVP boundary

The orchestration pass currently records a deterministic first-pass workflow. It does not yet edit repository files, call an external model, manage approvals, or dispatch isolated workers. Those capabilities should be added after the persisted task and verification loop has real usage.

## Next extensions

1. Add repository file inspection and tool execution records.
2. Add explicit task graph nodes and approval gates.
3. Connect model settings to a Replit-managed AI integration.
4. Make verification run actual project checks and attach their output.