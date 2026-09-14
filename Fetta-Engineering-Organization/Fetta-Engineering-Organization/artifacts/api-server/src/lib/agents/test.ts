import { createProvider } from "@workspace/ai-provider";
import type { ModelMessage } from "@workspace/ai-provider";
import type { AgentContext, TestResult } from "../agent-types";
import { buildContextMessage, readFileContent, type RepositoryContext } from "../repository-context";
import { runVerification } from "../tool-executor";
import { logger } from "../logger";

export async function runTest(
  context: AgentContext,
  repositoryContext: RepositoryContext,
): Promise<TestResult> {
  const provider = createProvider();

  const engineerResult = context.previousResults?.engineer;
  if (!engineerResult) {
    throw new Error("Test requires Engineer result");
  }

  // Read modified files for inspection
  let modifiedContents = "";
  for (const file of engineerResult.filesModified.slice(0, 3)) {
    try {
      const content = await readFileContent(repositoryContext.rootPath, file.path);
      modifiedContents += `\n\n--- ${file.path} (${file.action}) ---\n${content.slice(0, 2000)}`;
    } catch (err) {
      modifiedContents += `\n\n--- ${file.path} ---\n[Could not read]`;
    }
  }

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Test Agent in a Fetta engineering organization.

Your role is to verify that changes meet the objective through actual testing.

You must respond with a JSON object in this exact format:
{
  "verificationType": "typecheck" | "test" | "build" | "manual",
  "shouldRunCommand": true | false,
  "reasoning": "Why this verification approach"
}

Guidelines:
1. TypeScript projects: suggest "typecheck"
2. If tests exist: suggest "test"
3. Build-only verification: suggest "build"
4. If unsure or no automated tests: suggest "manual"
5. Be honest - only mark as passed if truly verified`,
    },
    {
      role: "user",
      content: `${buildContextMessage(repositoryContext)}

Objective: ${context.objective}

Files Modified:
${engineerResult.filesModified.map(f => `- ${f.path} (${f.action})`).join("\n")}

Implementation Details:
${engineerResult.implementationDetails}

Modified Code:
${modifiedContents}

Verification Plan from Architect:
${context.previousResults?.architect?.verificationPlan.join("\n") || "[No plan]"}

Determine the appropriate verification approach. Return ONLY valid JSON.`,
    },
  ];

  const response = await provider.complete(messages);

  // Parse verification approach
  let verificationDecision: {
    verificationType: "typecheck" | "test" | "build" | "manual";
    shouldRunCommand: boolean;
    reasoning: string;
  };

  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
    verificationDecision = JSON.parse(jsonStr);
  } catch (err) {
    logger.error({ err, content: response.content }, "Failed to parse test decision - attempting typecheck fallback");
    // Instead of manual assessment, default to executable typecheck
    verificationDecision = {
      verificationType: "typecheck",
      shouldRunCommand: true,
      reasoning: "Fallback to typecheck due to parse error - ensuring executable verification",
    };
  }

  logger.info({ 
    verificationType: verificationDecision.verificationType,
    shouldRun: verificationDecision.shouldRunCommand 
  }, "Test agent decision");

  // Execute verification - no manual assessment fallback
  let evidence: TestResult["evidence"];
  let passed = false;
  let failures: string[] = [];

  // If manual was chosen or shouldRunCommand is false, force typecheck instead
  if (verificationDecision.verificationType === "manual" || !verificationDecision.shouldRunCommand) {
    logger.info("Manual verification requested - enforcing typecheck instead for executable evidence");
    verificationDecision.verificationType = "typecheck";
    verificationDecision.shouldRunCommand = true;
  }

  try {
    const result = await runVerification(
      repositoryContext.rootPath,
      verificationDecision.verificationType,
    );

    passed = result.success;
    evidence = {
      verificationType: verificationDecision.verificationType,
      command: `${result.command} ${result.args.join(" ")}`,
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 2000), // Limit output
      stderr: result.stderr.slice(0, 2000),
      filesVerified: engineerResult.filesModified.map(f => f.path),
      timestamp: new Date().toISOString(),
    };

    if (!passed) {
      failures = [
        `Command failed with exit code ${result.exitCode}`,
        result.stderr.slice(0, 500),
      ];
    }

    logger.info({ passed, exitCode: result.exitCode }, "Verification command completed");
  } catch (error) {
    passed = false;
    evidence = {
      verificationType: verificationDecision.verificationType,
      filesVerified: engineerResult.filesModified.map(f => f.path),
      timestamp: new Date().toISOString(),
    };
    failures = [`Verification error: ${error instanceof Error ? error.message : "Unknown error"}`];
    
    logger.error({ error }, "Verification command failed");
  }

  return {
    passed,
    evidence,
    summary: passed 
      ? `Verification passed via ${verificationDecision.verificationType}` 
      : `Verification failed: ${failures.join("; ")}`,
    failures: passed ? undefined : failures,
  };
}
