import { createProvider } from "@workspace/ai-provider";
import type { ModelMessage } from "@workspace/ai-provider";
import type { AgentContext, EngineerResult } from "../agent-types";
import { buildContextMessage, writeFileContent, readFileContent, type RepositoryContext } from "../repository-context";
import { logger } from "../logger";
import { validatePath } from "../tool-executor";

export async function runEngineer(
  context: AgentContext,
  repositoryContext: RepositoryContext,
): Promise<EngineerResult> {
  const provider = createProvider();

  const architectPlan = context.previousResults?.architect;
  if (!architectPlan) {
    throw new Error("Engineer requires Architect plan");
  }

  // Read affected files
  let existingCode = "";
  for (const file of architectPlan.affectedFiles.slice(0, 5)) {
    try {
      const content = await readFileContent(repositoryContext.rootPath, file);
      existingCode += `\n\n--- ${file} ---\n${content.slice(0, 3000)}`;
    } catch (err) {
      existingCode += `\n\n--- ${file} ---\n[File does not exist yet]`;
    }
  }

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Engineer agent in a Fetta engineering organization.

Your role is to implement the planned changes following the architect's guidance.

You must respond with a JSON object in this exact format:
{
  "summary": "Brief summary of implementation",
  "filesModified": [
    {
      "path": "relative/path/to/file.ts",
      "action": "create" | "modify" | "delete"
    }
  ],
  "implementationDetails": "Detailed description of what was done",
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "content": "complete file content"
    }
  ]
}

Guidelines:
1. Follow the architect's plan exactly
2. Match existing code style and patterns
3. Provide complete, working code
4. Include proper error handling
5. Add appropriate comments`,
    },
    {
      role: "user",
      content: `${buildContextMessage(repositoryContext)}

Objective: ${context.objective}

Architect's Plan:
${JSON.stringify(architectPlan, null, 2)}

Existing Code:
${existingCode}

Implement the required changes. Return ONLY valid JSON with complete file contents.`,
    },
  ];

  const response = await provider.complete(messages);

  // Parse the JSON response
  let parsed: {
    summary: string;
    filesModified: Array<{ path: string; action: string }>;
    implementationDetails: string;
    files: Array<{ path: string; content: string }>;
  };

  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    logger.error({ err, content: response.content.slice(0, 500) }, "Failed to parse engineer response");
    throw new Error("Engineer did not return valid JSON");
  }

  // Validate and write files
  const filesModified: Array<{ path: string; action: "create" | "modify" | "delete" }> = [];
  
  for (const file of parsed.files) {
    // Validate path is within repository
    if (!validatePath(repositoryContext.rootPath, file.path)) {
      logger.error({ path: file.path }, "Path validation failed - outside repository");
      throw new Error(`Invalid file path: ${file.path}`);
    }

    await writeFileContent(repositoryContext.rootPath, file.path, file.content);
    
    const action = parsed.filesModified.find(f => f.path === file.path)?.action || "modify";
    filesModified.push({ 
      path: file.path, 
      action: action as "create" | "modify" | "delete"
    });
    
    logger.info({ path: file.path, action }, "File written");
  }

  return {
    summary: parsed.summary,
    filesModified,
    implementationDetails: parsed.implementationDetails,
    commandsRun: [], // No commands run yet in this implementation
  };
}
