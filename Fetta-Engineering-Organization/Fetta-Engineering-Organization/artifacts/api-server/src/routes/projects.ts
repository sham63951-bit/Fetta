import { randomUUID } from "node:crypto";
import path from "node:path";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  CreateProjectBody,
  CreateProjectResponse,
  CreateTaskBody,
  CreateTaskResponse,
  GetCurrentProjectResponse,
  GetProjectOverviewResponse,
  ListAgentsResponse,
  ListEventsResponse,
  ListMemoryResponse,
  ListTasksResponse,
  RunTaskResponse,
  ScanProjectResponse,
} from "@workspace/api-zod";
import {
  agentDefinitionsTable,
  agentRunsTable,
  db,
  eventsTable,
  memoriesTable,
  projectsTable,
  tasksTable,
} from "@workspace/db";
import { scanRepository, type RepositoryProfile } from "../lib/repository";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const agentSeeds = [
  ["coordinator", "Coordinator", "Organization", "Plans objectives, sequences work, and reconciles results.", "ready", "Ready to receive an objective.", "#e9b872"],
  ["architect", "Architect", "Architecture", "Maps the codebase and protects system coherence.", "ready", "Ready for architectural investigation.", "#9bb8ff"],
  ["database", "DB Agent", "Data systems", "Owns schemas, migrations, integrity, and query design.", "ready", "Ready to inspect data boundaries.", "#a8d5ba"],
  ["backend", "Backend Agent", "Backend engineering", "Owns APIs, services, business rules, and jobs.", "ready", "Ready to implement server changes.", "#d59bf6"],
  ["frontend", "Frontend Agent", "Frontend engineering", "Owns interfaces, state, interaction, and accessibility.", "ready", "Ready to shape the user surface.", "#f49fbc"],
  ["security", "Security Agent", "Security review", "Challenges permissions, secrets, isolation, and exposure.", "ready", "Ready to challenge risky changes.", "#f18f8f"],
  ["test", "Test Agent", "Verification", "Designs checks and turns completion claims into evidence.", "ready", "Ready to verify the result.", "#8ad8df"],
] as const;

function now() {
  return new Date();
}

function projectResponse(project: typeof projectsTable.$inferSelect) {
  return {
    ...project,
    profile: project.profile as RepositoryProfile,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function taskResponse(task: typeof tasksTable.$inferSelect) {
  return {
    ...task,
    summary: task.summary ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function seedProject(projectId: string, projectPath: string, name: string) {
  const timestamp = now();
  const scan = await scanRepository(projectPath);
  const profile = scan.profile;
  await db.insert(projectsTable).values({
    id: projectId,
    name,
    repositoryPath: projectPath,
    status: scan.status,
    profile,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(agentDefinitionsTable).values(
    agentSeeds.map(([id, agentName, role, description, status, activity, accent]) => ({
      id: `${projectId}:${id}`,
      projectId,
      name: agentName,
      role,
      description,
      status,
      currentActivity: activity,
      accent,
    })),
  );
  await db.insert(memoriesTable).values([
    {
      id: `${projectId}:stack`,
      projectId,
      type: "fact",
      title: "Detected stack",
      content: `${profile.language} project using ${profile.framework} with ${profile.packageManager}.`,
      source: "repository scan",
      confidence: "high",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: `${projectId}:git`,
      projectId,
      type: "convention",
      title: "Repository convention",
      content: `The active branch is ${profile.branch}. Git status: ${profile.gitStatus}.`,
      source: "repository scan",
      confidence: "medium",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: `${projectId}:verification`,
      projectId,
      type: "constraint",
      title: "Evidence before completion",
      content: "A task is not complete until Fetta records verification evidence.",
      source: "Fetta constitution",
      confidence: "high",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "project.scanned",
    agent: "Coordinator",
    message: `Repository understood as a ${profile.language} project.`,
    createdAt: timestamp,
  });
}

async function currentProject() {
  const existing = await db.select().from(projectsTable).limit(1);
  const defaultRepositoryPath = path.resolve(process.cwd(), "../..");
  if (existing[0]) {
    if (existing[0].id === "fetta-project" && existing[0].repositoryPath !== defaultRepositoryPath) {
      const scan = await scanRepository(defaultRepositoryPath);
      const [updated] = await db
        .update(projectsTable)
        .set({
          repositoryPath: defaultRepositoryPath,
          status: scan.status,
          profile: scan.profile,
          updatedAt: now(),
        })
        .where(eq(projectsTable.id, existing[0].id))
        .returning();
      return updated;
    }
    return existing[0];
  }
  const projectId = "fetta-project";
  await seedProject(projectId, defaultRepositoryPath, "Fetta");
  const [created] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  return created;
}

async function findProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  return project;
}

router.get("/projects/current", async (_req, res) => {
  const project = await currentProject();
  res.json(GetCurrentProjectResponse.parse(projectResponse(project)));
});

router.post("/projects", async (req, res) => {
  const input = CreateProjectBody.parse(req.body);
  const projectId = randomUUID();
  await seedProject(projectId, path.resolve(input.repositoryPath), input.name);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  res.status(201).json(CreateProjectResponse.parse(projectResponse(project)));
});

router.post("/projects/:projectId/scan", async (req, res) => {
  const projectId = String(req.params.projectId);
  const project = await findProject(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const scan = await scanRepository(project.repositoryPath);
  const timestamp = now();
  const [updated] = await db
    .update(projectsTable)
    .set({ profile: scan.profile, status: scan.status, updatedAt: timestamp })
    .where(eq(projectsTable.id, projectId))
    .returning();
  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "project.scanned",
    agent: "Coordinator",
    message: "Repository scan refreshed the Project Brain.",
    createdAt: timestamp,
  });
  await db
    .insert(memoriesTable)
    .values([
      {
        id: `${projectId}:stack`,
        projectId,
        type: "fact",
        title: "Detected stack",
        content: `${scan.profile.language} project using ${scan.profile.framework} with ${scan.profile.packageManager}.`,
        source: "repository scan",
        confidence: "high",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `${projectId}:git`,
        projectId,
        type: "convention",
        title: "Repository convention",
        content: `The active branch is ${scan.profile.branch}. Git status: ${scan.profile.gitStatus}.`,
        source: "repository scan",
        confidence: "medium",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ])
    .onConflictDoUpdate({
      target: memoriesTable.id,
      set: {
        content: sql`excluded.content`,
        updatedAt: timestamp,
      },
    });
  res.json(ScanProjectResponse.parse(projectResponse(updated)));
});

router.get("/projects/:projectId/overview", async (req, res) => {
  const projectId = String(req.params.projectId);
  const project = await findProject(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [agents, memories, tasks, risks] = await Promise.all([
    db.select().from(agentDefinitionsTable).where(eq(agentDefinitionsTable.projectId, projectId)),
    db.select().from(memoriesTable).where(eq(memoriesTable.projectId, projectId)),
    db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId)),
    db.select({ count: sql<number>`count(*)` }).from(memoriesTable).where(and(eq(memoriesTable.projectId, projectId), eq(memoriesTable.type, "risk"))),
  ]);
  res.json(GetProjectOverviewResponse.parse({
    project: projectResponse(project),
    agentCount: agents.length,
    memoryCount: memories.length,
    activeTaskCount: tasks.filter((task) => !["completed", "failed"].includes(task.status)).length,
    completedTaskCount: tasks.filter((task) => task.status === "completed").length,
    openRiskCount: Number(risks[0]?.count ?? 0),
  }));
});

router.get("/projects/:projectId/agents", async (req, res) => {
  const rows = await db.select().from(agentDefinitionsTable).where(eq(agentDefinitionsTable.projectId, String(req.params.projectId)));
  res.json(ListAgentsResponse.parse(rows));
});

router.get("/projects/:projectId/tasks", async (req, res) => {
  const rows = await db.select().from(tasksTable).where(eq(tasksTable.projectId, String(req.params.projectId))).orderBy(desc(tasksTable.updatedAt));
  res.json(ListTasksResponse.parse(rows.map(taskResponse)));
});

router.post("/projects/:projectId/tasks", async (req, res) => {
  const projectId = String(req.params.projectId);
  const input = CreateTaskBody.parse(req.body);
  const timestamp = now();
  const task = {
    id: randomUUID(),
    projectId,
    title: input.objective.length > 42 ? `${input.objective.slice(0, 42)}…` : input.objective,
    objective: input.objective,
    ownerAgent: "coordinator",
    status: "ready",
    verificationState: "not_started",
    summary: null,
    verificationEvidence: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as const;
  await db.insert(tasksTable).values(task);
  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "task.created",
    agent: "Coordinator",
    message: `New objective received: ${input.objective}`,
    createdAt: timestamp,
  });
  res.status(201).json(CreateTaskResponse.parse(taskResponse(task)));
});

router.post("/projects/:projectId/tasks/:taskId/run", async (req, res) => {
  const projectId = String(req.params.projectId);
  const taskId = String(req.params.taskId);
  const [task] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, taskId), eq(tasksTable.projectId, projectId)));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  
  // Prevent duplicate execution - check if already running
  if (task.status === "running") {
    res.status(409).json({ error: "Task is already running" });
    return;
  }
  
  const timestamp = now();

  // Atomically claim the task by setting it to running
  // If another request got here first, this update will affect 0 rows
  const updateResult = await db
    .update(tasksTable)
    .set({ 
      status: "running", 
      verificationState: "in_progress", 
      updatedAt: timestamp 
    })
    .where(and(
      eq(tasksTable.id, taskId),
      sql`${tasksTable.status} != 'running'` // Only update if not already running
    ))
    .returning({ id: tasksTable.id });

  // If no rows were updated, another request claimed it first
  if (updateResult.length === 0) {
    res.status(409).json({ error: "Task is already running (race condition)" });
    return;
  }

  // Execute the real orchestration asynchronously
  // We'll return immediately so the UI gets a response, but continue working
  (async () => {
    try {
      const { executeTaskV2 } = await import("../lib/orchestrator-v2");
      
      // Add orchestration timeout - 5 minutes
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Orchestration timeout - exceeded 5 minutes")), 300000)
      );
      
      const result = await Promise.race([
        executeTaskV2(taskId, projectId),
        timeoutPromise,
      ]);

      // Update task with results
      const finalStatus = result.success ? "completed" : "failed";
      const verificationState = result.verificationPassed ? "passed" : "failed";

      await db.update(tasksTable).set({
        status: finalStatus,
        verificationState,
        summary: result.summary,
        verificationEvidence: {
          passed: result.verificationPassed,
          evidence: {
            verificationType: typeof result.evidence.verificationType === "string"
              ? result.evidence.verificationType
              : "orchestration",
            command: typeof result.evidence.command === "string" ? result.evidence.command : undefined,
            exitCode: typeof result.evidence.exitCode === "number" ? result.evidence.exitCode : undefined,
            stdout: typeof result.evidence.stdout === "string" ? result.evidence.stdout : undefined,
            stderr: typeof result.evidence.stderr === "string" ? result.evidence.stderr : undefined,
            filesVerified: Array.isArray(result.evidence.filesVerified)
              ? result.evidence.filesVerified.filter((file): file is string => typeof file === "string")
              : [],
            timestamp: typeof result.evidence.timestamp === "string"
              ? result.evidence.timestamp
              : new Date().toISOString(),
          },
          filesModified: result.filesModified,
        },
        updatedAt: now(),
      }).where(eq(tasksTable.id, taskId));

      // Update agent states
      await db
        .update(agentDefinitionsTable)
        .set({ status: "verified", currentActivity: "Verification evidence recorded." })
        .where(and(eq(agentDefinitionsTable.projectId, projectId), eq(agentDefinitionsTable.id, `${projectId}:test`)));

      await db
        .update(agentDefinitionsTable)
        .set({ status: "ready", currentActivity: "Ready for the next objective." })
        .where(and(eq(agentDefinitionsTable.projectId, projectId), sql`${agentDefinitionsTable.id} <> ${`${projectId}:test`}`));

      // Record verification event
      await db.insert(eventsTable).values({
        id: randomUUID(),
        projectId,
        type: result.verificationPassed ? "verification.passed" : "verification.failed",
        agent: "Test Agent",
        message: result.verificationPassed 
          ? "Verification passed and evidence was attached to the task."
          : "Verification failed. See task details for evidence.",
        createdAt: now(),
      });

      // Add to project memory
      await db.insert(memoriesTable).values({
        id: randomUUID(),
        projectId,
        type: "lesson",
        title: result.verificationPassed ? "Orchestration completed" : "Orchestration failed",
        content: `The organization completed a real Coordinator → Architect → Backend → Test workflow. Files modified: ${result.filesModified.join(", ")}`,
        source: "task verification",
        confidence: result.verificationPassed ? "high" : "medium",
        createdAt: now(),
        updatedAt: now(),
      });
    } catch (error) {
      // Log and update task as failed
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isTimeout = errorMessage.includes("timeout");
      
      logger.error({ error, taskId, projectId, isTimeout }, "Orchestration failed");

      await db.update(tasksTable).set({
        status: "failed",
        verificationState: "failed",
        summary: isTimeout 
          ? `Orchestration timeout: Execution exceeded 5 minutes and was terminated.`
          : `Orchestration error: ${errorMessage}`,
        updatedAt: now(),
      }).where(eq(tasksTable.id, taskId));

      await db
        .update(agentDefinitionsTable)
        .set({ status: "ready", currentActivity: "Ready for the next objective." })
        .where(eq(agentDefinitionsTable.projectId, projectId));

      await db.insert(eventsTable).values({
        id: randomUUID(),
        projectId,
        type: isTimeout ? "orchestration.timeout" : "orchestration.failed",
        agent: "Coordinator",
        message: isTimeout 
          ? "Orchestration timeout - execution exceeded 5 minutes"
          : `Orchestration failed: ${errorMessage}`,
        createdAt: now(),
      });
    }
  })();

  // Return immediately with running state
  const [updated] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, taskId));
  
  res.json(RunTaskResponse.parse(taskResponse(updated)));
});

router.get("/projects/:projectId/memory", async (req, res) => {
  const rows = await db.select().from(memoriesTable).where(eq(memoriesTable.projectId, String(req.params.projectId))).orderBy(desc(memoriesTable.updatedAt));
  res.json(ListMemoryResponse.parse(rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))));
});

router.get("/projects/:projectId/events", async (req, res) => {
  const rows = await db.select().from(eventsTable).where(eq(eventsTable.projectId, String(req.params.projectId))).orderBy(desc(eventsTable.createdAt)).limit(24);
  res.json(ListEventsResponse.parse(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))));
});

router.get("/projects/:projectId/tasks/:taskId/runs", async (req, res) => {
  const { projectId, taskId } = req.params;
  const runs = await db
    .select()
    .from(agentRunsTable)
    .where(and(
      eq(agentRunsTable.projectId, String(projectId)),
      eq(agentRunsTable.taskId, String(taskId))
    ))
    .orderBy(desc(agentRunsTable.startedAt));
  
  res.json(runs.map(run => ({
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() || null,
  })));
});

router.get("/projects/:projectId/runs/:runId", async (req, res) => {
  const [run] = await db
    .select()
    .from(agentRunsTable)
    .where(eq(agentRunsTable.id, String(req.params.runId)));
  
  if (!run) {
    res.status(404).json({ error: "Agent run not found" });
    return;
  }
  
  res.json({
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() || null,
  });
});

export default router;