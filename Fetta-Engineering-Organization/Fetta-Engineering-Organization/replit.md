# Fetta

Fetta is a local-first AI engineering organization that understands a repository, coordinates specialist agents, and records evidence-backed work.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `MODEL_API_KEY`, `MODEL_BASE_URL`, `MODEL_NAME` — AI provider configuration

## Quick Start

1. Copy `.env.example` to `.env` and configure:
   ```bash
   DATABASE_URL=postgresql://user:pass@localhost:5432/fetta
   MODEL_PROVIDER=openai
   MODEL_BASE_URL=https://api.openai.com/v1
   MODEL_API_KEY=sk-your-key-here
   MODEL_NAME=gpt-4
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Push database schema:
   ```bash
   pnpm --filter @workspace/db run push
   ```

4. Start the API server:
   ```bash
   pnpm --filter @workspace/api-server run dev
   ```

5. Start the frontend (in another terminal):
   ```bash
   cd artifacts/fetta
   PORT=3000 BASE_PATH=/ pnpm run dev
   ```

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: OpenAI SDK (OpenAI-compatible endpoints)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (API server), Vite (frontend)

## Where things live

- `lib/ai-provider/` — Model provider abstraction (OpenAI, Anthropic-compatible)
- `lib/api-spec/openapi.yaml` — source of truth for the Fetta API contract
- `lib/api-client-react` and `lib/api-zod` — generated clients and response schemas
- `lib/db/src/schema/index.ts` — PostgreSQL/Drizzle persistence schema
- `artifacts/api-server/src/routes/projects.ts` — project, scan, organization, task, memory, and event routes
- `artifacts/api-server/src/lib/orchestrator.ts` — Real AI agent orchestration engine
- `artifacts/api-server/src/lib/repository.ts` — deterministic repository scanner
- `artifacts/api-server/src/lib/repository-context.ts` — Repository file operations for agents
- `artifacts/fetta/src` — organization view, task, memory, repository, and settings surfaces

## Architecture decisions

- The API server and Fetta web app remain separate artifacts in the existing pnpm monorepo.
- OpenAPI is extended before generated clients are consumed by the frontend.
- Project state is stored in PostgreSQL through Drizzle rather than simulated in the browser.
- Real AI orchestration executes: Coordinator → Architect → Backend → Test with actual model calls.
- Agents read and write real repository files, with evidence stored in the database.

## Product

The first vertical slice supports repository initialization and deterministic scanning, a central Project Brain, seven visible specialist agents, task intake, **real AI-powered orchestration**, verification with evidence, activity history, memory search, repository details, and model settings.

## Real Agent Runtime

Fetta now executes genuine AI workflows:

1. **Coordinator** analyzes objectives and creates execution plans
2. **Architect** reviews codebase structure and patterns
3. **Backend** implements changes (writes actual files)
4. **Test** verifies implementation and records evidence

All agents use the configured model provider and interact with the real repository.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`.
- The Fetta Vite config requires `PORT` and `BASE_PATH` when running a production build; the managed workflow supplies them.
- The API default project scans the workspace root, not the API package directory.
- Task orchestration runs asynchronously - the endpoint returns immediately but agents continue working.
- Ensure your MODEL_API_KEY has sufficient credits/quota for agent execution.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.env.example` for all required environment variables
