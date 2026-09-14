import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  agentDefinitionsTable,
  db,
  eventsTable,
  memoriesTable,
  projectsTable,
  tasksTable,
} from "@workspace/db";
import { createProvider } from "@workspace/ai-provider";
import type { ModelMessage } from "@workspace/ai-provider";
import {
  buildContextMessage,
  getGitBranch,
  getGitDiff,
  listFiles,
  readFileContent,
  writeFileContent,
  type RepositoryContext,
} from "./repository-context";
import { scanRepository } from "./repository";
import { logger } from "./logger";

interface OrchestrationResult {
  success: boolean;
  summary: string;
  filesModified: string[];
  verificationPassed: boolean;
  evidence: string;
}

/**
 * Build repository context for AI
 */
async function buildRepositoryContext(
  repositoryPath: string,
): Promise<RepositoryContext> {
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
 * Coordinator agent: Plans the task
 */
async function runCoordinator(
  objective: string,
  context: RepositoryContext,
): Promise<string> {
  const provider = createProvider();

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Coordinator agent in a Fetta engineering organization. Your role is to analyze objectives and create execution plans.

Given an engineering objective, you should:
1. Break it down into concrete steps
2. Identify which files need to be inspected or modified
3. Determine if this is primarily a backend, frontend, or infrastructure task
4. Note any potential risks or dependencies

Be specific about file paths and technical approach. Keep your plan concise and actionable.`,
    },
    {
      role: "user",
      content: `${buildContextMessage(context)}

Objective: ${objective}

Create an execution plan for this objective. Be specific about which files to inspect or modify.`,
    },
  ];

  const response = await provider.complete(messages);
  return response.content;
}

/**
 * Architect agent: Reviews codebase structure
 */
async function runArchitect(
  objective: string,
  plan: string,
  context: RepositoryContext,
): Promise<string> {
  const provider = createProvider();

  // Extract mentioned files from the plan
  const filePattern = /`([^`]+\.(ts|js|tsx|jsx|json|yaml|yml|md))`/g;
  const matches = [...plan.matchAll(filePattern)];
  const filesToInspect = matches.map((m) => m[1]).slice(0, 5); // Limit to 5 files

  let fileContents = "";
  for (const file of filesToInspect) {
    try {
      const content = await readFileContent(context.rootPath, file);
      fileContents += `\n\n--- ${file} ---\n${content.slice(0, 3000)}`; // Limit per file
    } catch (err) {
      fileContents += `\n\n--- ${file} ---\n[File not found or cannot be read]`;
    }
  }

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Architect agent in a Fetta engineering organization. Your role is to review the codebase structure and ensure changes align with existing patterns.

Given a plan, you should:
1. Inspect relevant existing files
2. Identify patterns and conventions
3. Note any architectural concerns
4. Recommend the specific approach that fits the codebase

Be specific about code style, patterns, and where new code should go.`,
    },
    {
      role: "user",
      content: `${buildContextMessage(context)}

Plan from Coordinator:
${plan}

Relevant existing code:
${fileContents || "[No existing files to inspect]"}

Review the plan and provide architectural guidance. Specify exactly what should be implemented and where.`,
    },
  ];

  const response = await provider.complete(messages);
  return response.content;
}

/**
 * Backend agent: Implements the changes
 */
async function runBackend(
  objective: string,
  plan: string,
  architectureGuidance: string,
  context: RepositoryContext,
): Promise<{ implementation: string; filesModified: string[] }> {
  const provider = createProvider();

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Backend Agent in a Fetta engineering organization. Your role is to implement the planned changes.

You must respond with a JSON object in this exact format:
{
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "action": "create" | "modify",
      "content": "full file content here"
    }
  ],
  "summary": "Brief summary of changes made"
}

Be precise with file paths and provide complete, working code.`,
    },
    {
      role: "user",
      content: `${buildContextMessage(context)}

Objective: ${objective}

Plan: ${plan}

Architecture Guidance: ${architectureGuidance}

Implement the required changes. Return ONLY valid JSON with the files to create/modify.`,
    },
  ];

  const response = await provider.complete(messages);

  // Parse the JSON response
  let parsed: { files: Array<{ path: string; action: string; content: string }>; summary: string };
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    logger.error({ err, content: response.content }, "Failed to parse backend response");
    throw new Error("Backend agent did not return valid JSON");
  }

  // Write the files
  const filesModified: string[] = [];
  for (const file of parsed.files) {
    await writeFileContent(context.rootPath, file.path, file.content);
    filesModified.push(file.path);
    logger.info({ path: file.path, action: file.action }, "File written");
  }

  return {
    implementation: parsed.summary,
    filesModified,
  };
}

/**
 * Test agent: Verifies the changes
 */
async function runTest(
  objective: string,
  filesModified: string[],
  context: RepositoryContext,
): Promise<{ passed: boolean; evidence: string }> {
  const provider = createProvider();

  // Read the modified files
  let modifiedContents = "";
  for (const file of filesModified.slice(0, 3)) {
    // Limit to 3 files
    try {
      const content = await readFileContent(context.rootPath, file);
      modifiedContents += `\n\n--- ${file} ---\n${content.slice(0, 2000)}`;
    } catch (err) {
      modifiedContents += `\n\n--- ${file} ---\n[Could not read]`;
    }
  }

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Test Agent in a Fetta engineering organization. Your role is to verify that changes meet the objective.

You must respond with a JSON object in this exact format:
{
  "passed": true | false,
  "evidence": "Specific evidence of why this passed or failed"
}

Check:
1. Does the code exist where expected?
2. Does it match the objective?
3. Is the implementation reasonable?

Be honest - if something is wrong, mark it as failed.`,
    },
    {
      role: "user",
      content: `${buildContextMessage(context)}

Objective: ${objective}

Files Modified: ${filesModified.join(", ")}

Modified Code:
${modifiedContents}

Verify if the objective was successfully completed. Return ONLY valid JSON.`,
    },
  ];

  const response = await provider.complete(messages);

  // Parse the JSON response
  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
    const parsed = JSON.parse(jsonStr);
    return {
      passed: Boolean(parsed.passed),
      evidence: String(parsed.evidence),
    };
  } catch (err) {
    logger.error({ err, content: response.content }, "Failed to parse test response");
    // Default to failed if we can't parse
    return {
      passed: false,
      evidence: "Verification failed: Could not parse test agent response",
    };
  }
}

/**
 * Execute the full orchestration workflow
 */
export async function executeTask(
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

  // Build context
  logger.info({ taskId, projectId, objective }, "Building repository context");
  const context = await buildRepositoryContext(repositoryPath);

  // Stage 1: Coordinator
  logger.info("Running Coordinator agent");
  await db
    .update(agentDefinitionsTable)
    .set({
      status: "working",
      currentActivity: "Analyzing objective and creating execution plan",
    })
    .where(
      and(
        eq(agentDefinitionsTable.projectId, projectId),
        eq(agentDefinitionsTable.id, `${projectId}:coordinator`),
      ),
    );

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.assigned",
    agent: "Coordinator",
    message: "Analyzing objective and creating execution plan",
    createdAt: now(),
  });

  const plan = await runCoordinator(objective, context);
  logger.info({ plan: plan.slice(0, 200) }, "Coordinator completed");

  // Stage 2: Architect
  logger.info("Running Architect agent");
  await db
    .update(agentDefinitionsTable)
    .set({
      status: "working",
      currentActivity: "Reviewing codebase structure and patterns",
    })
    .where(
      and(
        eq(agentDefinitionsTable.projectId, projectId),
        eq(agentDefinitionsTable.id, `${projectId}:architect`),
      ),
    );

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.started",
    agent: "Architect",
    message: "Reviewing codebase structure and patterns",
    createdAt: now(),
  });

  const architectureGuidance = await runArchitect(objective, plan, context);
  logger.info({ guidance: architectureGuidance.slice(0, 200) }, "Architect completed");

  // Stage 3: Backend
  logger.info("Running Backend agent");
  await db
    .update(agentDefinitionsTable)
    .set({
      status: "working",
      currentActivity: "Implementing changes",
    })
    .where(
      and(
        eq(agentDefinitionsTable.projectId, projectId),
        eq(agentDefinitionsTable.id, `${projectId}:backend`),
      ),
    );

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.started",
    agent: "Backend Agent",
    message: "Implementing changes",
    createdAt: now(),
  });

  const { implementation, filesModified } = await runBackend(
    objective,
    plan,
    architectureGuidance,
    context,
  );
  logger.info({ implementation, filesModified }, "Backend completed");

  // Stage 4: Test
  logger.info("Running Test agent");
  await db
    .update(agentDefinitionsTable)
    .set({
      status: "reviewing",
      currentActivity: "Verifying implementation",
    })
    .where(
      and(
        eq(agentDefinitionsTable.projectId, projectId),
        eq(agentDefinitionsTable.id, `${projectId}:test`),
      ),
    );

  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "agent.started",
    agent: "Test Agent",
    message: "Verifying implementation",
    createdAt: now(),
  });

  const { passed, evidence } = await runTest(objective, filesModified, context);
  logger.info({ passed, evidence }, "Test completed");

  const summary = `Coordinator: Created execution plan
Architect: Reviewed codebase structure
Backend: ${implementation}
Test: ${evidence}

Files modified: ${filesModified.join(", ")}`;

  return {
    success: true,
    summary,
    filesModified,
    verificationPassed: passed,
    evidence,
  };
}
