import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  agentDefinitionsTable,
  agentRunsTable,
  db,
  eventsTable,
  memoriesTable,
  projectsTable,
  tasksTable,
} from "@workspace/db";
import { logger } from "./logger";
import type { AgentContext, CoordinatorResult, ArchitectResult, EngineerResult, TestResult } from "./agent-types";
import { runCoordinator } from "./agents/coordinator";
import { runArchitect } from "./agents/architect";
import { runEngineer } from "./agents/engineer";
import { runTest } from "./agents/test";
import { scanRepository } from "./repository";
import { getGitBranch, getGitDiff, listFiles } from "./repository-context";

interface OrchestrationResult {
  success: boolean;
  summary: string;
  filesModified: string[];
  verificationPassed: boolean;
  evidence: Record<string, unknown>;
}

/**
 * Create an agent run record
 */
async function createAgentRun(
  projectId: string,
  taskId: string,
  agentId: string,
  agentName: string,
  input: Record<string, unknown>,
) {
  const runId = randomUUID();
  
  await db.insert(agentRunsTable).values({
    id: runId,
    projectId,
    taskId,
    agentId,
    agentName,
    status: "running",
    startedAt: new Date(),
    completedAt: null,
    input,
    output: null,
    error: null,
    metadata: null,
  });

  return runId;
}

/**
 * Complete an agent run
 */
async function completeAgentRun(
  runId: string,
  status: "completed" | "failed",
  output?: Record<string, unknown>,
  error?: string,
  metadata?: { model?: string; tokensUsed?: number; duration?: number },
) {
  await db
    .update(agentRunsTable)
    .set({
      status,
      completedAt: new Date(),
      output: output || null,
      error: error || null,
      metadata: metadata || null,
    })
    .where(eq(agentRunsTable.id, runId));
}

/**
 * Build repository context
 */
async function buildRepositoryContext(repositoryPath: string) {
  const scan = await scanRepository(repositoryPath);
  const files = await listFiles(repositoryPath);
  const gitBranch = await getGitBranch(repositoryPath);
  const gitDiff = await getGitDiff(repositoryPath);

  return {
    rootPath: repositoryPath,
    files,
    gitBranch: gitBranch ?? undefined,
    gitDiff: gitDiff ?? undefined,
    profile: {
      language: scan.profile.language,
      framework: scan.profile.framework,
      packageManager: scan.profile.packageManager,
    },
  };
}

/**
 * Load relevant project memory
 */
async function loadProjectMemory(projectId: string) {
  const memories = await db
    .select()
    .from(memoriesTable)
    .where(eq(memoriesTable.projectId, projectId))
    .limit(10);

  return memories.map(m => ({
    type: m.type,
    title: m.title,
    content: m.content,
  }));
}

/**
 * Extract useful lessons from task completion
 */
function extractLessons(
  objective: string,
  architectResult: ArchitectResult,
  engineerResult: EngineerResult,
  testResult: TestResult,
): Array<{ type: string; title: string; content: string }> {
  const lessons: Array<{ type: string; title: string; content: string }> = [];

  // Extract architectural decisions
  if (architectResult.findings.length > 0) {
    const significantFindings = architectResult.findings.filter(
      f => f.toLowerCase().includes("pattern") || 
           f.toLowerCase().includes("convention") ||
           f.toLowerCase().includes("architecture")
    );
    
    if (significantFindings.length > 0) {
      lessons.push({
        type: "convention",
        title: "Codebase patterns observed",
        content: significantFindings.join("; "),
      });
    }
  }

  // Extract implementation approach if novel
  if (architectResult.implementationPlan.technicalApproach.length > 50) {
    lessons.push({
      type: "decision",
      title: `Implementation approach for: ${objective.slice(0, 50)}`,
      content: architectResult.implementationPlan.technicalApproach,
    });
  }

  // Record risks if they were mitigated
  if (architectResult.risks.length > 0 && testResult.passed) {
    lessons.push({
      type: "lesson",
      title: "Risks successfully mitigated",
      content: `Identified risks: ${architectResult.risks.join("; ")}. Implementation passed verification.`,
    });
  }

  // Record test approach
  if (testResult.evidence.command) {
    lessons.push({
      type: "fact",
      title: "Verification command for this type of change",
      content: `Command: ${testResult.evidence.command}. Exit code: ${testResult.evidence.exitCode}`,
    });
  }

  return lessons;
}

/**
 * Execute orchestration workflow
 */
export async function executeTaskV2(
  taskId: string,
  projectId: string,
): Promise<OrchestrationResult> {
  const now = () => new Date();

  // Load task and project
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, taskId), eq(tasksTable.projectId, projectId)));

  if (!task) {
    throw new Error("Task not found");
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));

  if (!project) {
    throw new Error("Project not found");
  }

  const repositoryPath = project.repositoryPath;
  const objective = task.objective;

  logger.info({ taskId, projectId, objective }, "Starting orchestration v2");

  // Build context
  const repositoryContext = await buildRepositoryContext(repositoryPath);
  const projectMemory = await loadProjectMemory(projectId);

  const agentContext: AgentContext = {
    projectId,
    taskId,
    objective,
    repositoryPath,
    projectMemory,
    previousResults: {},
  };

  let coordinatorResult: CoordinatorResult;
  let architectResult: ArchitectResult;
  let engineerResult: EngineerResult;
  let testResult: TestResult;

  // Stage 1: Coordinator
  logger.info("Running Coordinator");
  await db
    .update(agentDefinitionsTable)
    .set({ status: "working", currentActivity: "Analyzing objective" })
    .where(and(
      eq(agentDefinitionsTable.projectId, projectId),
      eq(agentDefinitionsTable.id, `${projectId}:coordinator`),
    ));

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.started",
    agent: "Coordinator",
    message: "Analyzing objective and determining workflow",
    createdAt: now(),
  });

  const coordRunId = await createAgentRun(
    projectId,
    taskId,
    "coordinator",
    "Coordinator",
    { objective },
  );

  try {
    coordinatorResult = await runCoordinator(agentContext, repositoryContext);
    await completeAgentRun(coordRunId, "completed", coordinatorResult as any);
    
    agentContext.previousResults!.coordinator = coordinatorResult;
    logger.info({ action: coordinatorResult.action }, "Coordinator completed");
  } catch (error) {
    await completeAgentRun(coordRunId, "failed", undefined, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }

  // Check if we should continue
  if (coordinatorResult.action === "blocked") {
    return {
      success: false,
      summary: `Coordinator blocked: ${coordinatorResult.reason}`,
      filesModified: [],
      verificationPassed: false,
      evidence: { coordinatorReason: coordinatorResult.reason },
    };
  }

  // Stage 2: Architect
  logger.info("Running Architect");
  await db
    .update(agentDefinitionsTable)
    .set({ status: "working", currentActivity: "Reviewing codebase structure" })
    .where(and(
      eq(agentDefinitionsTable.projectId, projectId),
      eq(agentDefinitionsTable.id, `${projectId}:architect`),
    ));

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.started",
    agent: "Architect",
    message: "Reviewing codebase and creating implementation plan",
    createdAt: now(),
  });

  const archRunId = await createAgentRun(
    projectId,
    taskId,
    "architect",
    "Architect",
    { objective, coordinatorPlan: coordinatorResult.plan },
  );

  try {
    architectResult = await runArchitect(agentContext, repositoryContext);
    await completeAgentRun(archRunId, "completed", architectResult as any);
    
    agentContext.previousResults!.architect = architectResult;
    logger.info({ affectedFiles: architectResult.affectedFiles }, "Architect completed");
  } catch (error) {
    await completeAgentRun(archRunId, "failed", undefined, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }

  // Stage 3: Engineer
  logger.info("Running Engineer");
  await db
    .update(agentDefinitionsTable)
    .set({ status: "working", currentActivity: "Implementing changes" })
    .where(and(
      eq(agentDefinitionsTable.projectId, projectId),
      eq(agentDefinitionsTable.id, `${projectId}:backend`),
    ));

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.started",
    agent: "Backend Agent",
    message: `Implementing changes to ${architectResult.affectedFiles.length} files`,
    createdAt: now(),
  });

  const engRunId = await createAgentRun(
    projectId,
    taskId,
    "backend",
    "Backend Agent",
    { objective, architectPlan: architectResult },
  );

  try {
    engineerResult = await runEngineer(agentContext, repositoryContext);
    await completeAgentRun(engRunId, "completed", engineerResult as any);
    
    agentContext.previousResults!.engineer = engineerResult;
    logger.info({ filesModified: engineerResult.filesModified.length }, "Engineer completed");
  } catch (error) {
    await completeAgentRun(engRunId, "failed", undefined, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }

  // Stage 4: Test
  logger.info("Running Test");
  await db
    .update(agentDefinitionsTable)
    .set({ status: "reviewing", currentActivity: "Verifying implementation" })
    .where(and(
      eq(agentDefinitionsTable.projectId, projectId),
      eq(agentDefinitionsTable.id, `${projectId}:test`),
    ));

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.started",
    agent: "Test Agent",
    message: "Verifying implementation meets objective",
    createdAt: now(),
  });

  const testRunId = await createAgentRun(
    projectId,
    taskId,
    "test",
    "Test Agent",
    { objective, engineerResult },
  );

  try {
    testResult = await runTest(agentContext, repositoryContext);
    await completeAgentRun(testRunId, "completed", testResult as any);
    
    logger.info({ passed: testResult.passed }, "Test completed");
  } catch (error) {
    await completeAgentRun(testRunId, "failed", undefined, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }

  // Extract and save useful lessons
  const lessons = extractLessons(objective, architectResult, engineerResult, testResult);
  
  for (const lesson of lessons) {
    await db.insert(memoriesTable).values({
      id: randomUUID(),
      projectId,
      type: lesson.type,
      title: lesson.title,
      content: lesson.content,
      source: "task completion",
      confidence: "high",
      createdAt: now(),
      updatedAt: now(),
    });
  }

  // Build summary
  const summary = `Coordinator: ${coordinatorResult.reason}
Architect: ${architectResult.summary}
Engineer: ${engineerResult.summary}
Test: ${testResult.summary}

Files modified: ${engineerResult.filesModified.map(f => f.path).join(", ")}`;

  return {
    success: testResult.passed,
    summary,
    filesModified: engineerResult.filesModified.map(f => f.path),
    verificationPassed: testResult.passed,
    evidence: testResult.evidence,
  };
}
