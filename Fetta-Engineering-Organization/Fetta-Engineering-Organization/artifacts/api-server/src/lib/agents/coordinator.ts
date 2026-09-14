import { createProvider } from "@workspace/ai-provider";
import type { ModelMessage } from "@workspace/ai-provider";
import type { AgentContext, CoordinatorResult } from "../agent-types";
import { buildContextMessage, type RepositoryContext } from "../repository-context";
import { logger } from "../logger";

export async function runCoordinator(
  context: AgentContext,
  repositoryContext: RepositoryContext,
): Promise<CoordinatorResult> {
  const provider = createProvider();

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: `You are the Coordinator agent in a Fetta engineering organization.

Your role is to analyze objectives and determine the next action.

You must respond with a JSON object in this exact format:
{
  "action": "delegate" | "complete" | "blocked",
  "targetAgent": "architect" | "backend" | "test" (if action is delegate),
  "reason": "Brief explanation of decision",
  "plan": "Execution plan with concrete steps",
  "requiredContext": ["file1.ts", "file2.ts"],
  "verificationRequirements": ["Check X", "Verify Y"]
}

Decision rules:
- If objective needs planning → delegate to "architect"
- If architect produced a plan → delegate to "backend"
- If backend completed work → delegate to "test"
- If test passed → action "complete"
- If any stage failed or is unclear → action "blocked"

Be specific about file paths and technical approach.`,
    },
    {
      role: "user",
      content: `${buildContextMessage(repositoryContext)}

Objective: ${context.objective}

${context.previousResults?.architect ? `Architect completed with plan:\n${JSON.stringify(context.previousResults.architect, null, 2)}` : ""}
${context.previousResults?.engineer ? `Engineer completed work:\n${JSON.stringify(context.previousResults.engineer, null, 2)}` : ""}

Determine the next action. Return ONLY valid JSON.`,
    },
  ];

  const response = await provider.complete(messages);

  // Parse the JSON response
  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response.content;
    const parsed = JSON.parse(jsonStr) as CoordinatorResult;
    
    logger.info({ action: parsed.action, targetAgent: parsed.targetAgent }, "Coordinator decision");
    
    return parsed;
  } catch (err) {
    logger.error({ err, content: response.content }, "Failed to parse coordinator response");
    throw new Error("Coordinator did not return valid JSON");
  }
}
