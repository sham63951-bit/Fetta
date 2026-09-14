import { createProvider } from "@workspace/ai-provider";
import type { ModelMessage } from "@workspace/ai-provider";
import type { AgentContext, ArchitectResult } from "../agent-types";
import { buildContextMessage, readFileContent, type RepositoryContext } from "../repository-context";
import { logger } from "../logger";

export async function runArchitect(
  context: AgentContext,
  repositoryContext: RepositoryContext,
): Promise<ArchitectResult> {
  const provider = createProvider();

  // Extract file mentions from coordinator plan if available
  const plan = context.previousResults?.coordinator?.plan || "";
  const filePattern = /`([^`]+\.(ts|js|tsx|jsx|json|yaml|yml|md|py|go|rs))`/g;
  const matches = [...plan.matchAll(filePattern)];
  const filesToInspect = matches.map((m) => m[1]).slice(0, 5);

  let fileContents = "";
  for (const file of filesToInspect) {
    try {
      const content = await readFileContent(repositoryContext.rootPath, file);
      fileContents += `\n\n--- ${file} ---\n${content.slice(0, 3000)}`;
    } catch (err) {
      fileContents += `\n\n--- ${file} ---\n[File not found or cannot be read]`;
    }
  }

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Architect agent in a Fetta engineering organization.

Your role is to review the codebase structure and create an implementation plan.

You must respond with a JSON object in this exact format:
{
  "summary": "Brief architectural assessment",
  "findings": ["Finding 1", "Finding 2"],
  "affectedFiles": ["path/to/file1.ts", "path/to/file2.ts"],
  "implementationPlan": {
    "steps": ["Step 1", "Step 2", "Step 3"],
    "technicalApproach": "Specific approach description",
    "codeLocation": "Where new code should go"
  },
  "risks": ["Risk 1", "Risk 2"],
  "verificationPlan": ["Check 1", "Check 2"]
}

Guidelines:
1. Inspect relevant existing files
2. Identify patterns and conventions
3. Note architectural concerns
4. Recommend specific approach that fits the codebase
5. Be concrete about file paths and code locations`,
    },
    {
      role: "user",
      content: `${buildContextMessage(repositoryContext)}

Objective: ${context.objective}

Plan from Coordinator:
${plan}

Relevant existing code:
${fileContents || "[No existing files to inspect]"}

Project Memory:
${context.projectMemory?.map(m => `- ${m.title}: ${m.content}`).join("\n") || "[No relevant memory]"}

Review the codebase and provide architectural guidance. Return ONLY valid JSON.`,
    },
  ];

  const response = await provider.complete(messages);

  // Parse the JSON response
  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
    const parsed = JSON.parse(jsonStr) as ArchitectResult;
    
    logger.info({ 
      affectedFiles: parsed.affectedFiles.length, 
      risks: parsed.risks.length 
    }, "Architect completed");
    
    return parsed;
  } catch (err) {
    logger.error({ err, content: response.content }, "Failed to parse architect response");
    throw new Error("Architect did not return valid JSON");
  }
}
