import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  success: boolean;
}

/**
 * Execute a command safely within repository bounds
 */
export async function executeCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeout?: number;
    env?: Record<string, string>;
    agentRole?: "coordinator" | "architect" | "backend" | "test";
  },
): Promise<CommandResult> {
  const startTime = Date.now();
  
  // Enforce command permissions at the tool boundary
  if (options.agentRole && !isCommandAllowed(command, options.agentRole)) {
    const duration = Date.now() - startTime;
    logger.warn({ command, agentRole: options.agentRole }, "Command not allowed for agent role");
    
    return {
      command,
      args,
      exitCode: 126, // Permission denied exit code
      stdout: "",
      stderr: `Command '${command}' is not allowed for agent role '${options.agentRole}'`,
      duration,
      success: false,
    };
  }
  
  logger.info({ command, args, cwd: options.cwd }, "Executing command");

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 30000,
      maxBuffer: 1024 * 1024 * 10, // 10MB
      env: { ...process.env, ...options.env },
    });

    const duration = Date.now() - startTime;

    logger.info({ command, exitCode: 0, duration }, "Command succeeded");

    return {
      command,
      args,
      exitCode: 0,
      stdout,
      stderr,
      duration,
      success: true,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const exitCode = error.code ?? 1;
    const stdout = error.stdout ?? "";
    const stderr = error.stderr ?? error.message ?? "";

    logger.warn({ command, exitCode, duration, stderr: stderr.slice(0, 500) }, "Command failed");

    return {
      command,
      args,
      exitCode,
      stdout,
      stderr,
      duration,
      success: false,
    };
  }
}

/**
 * Validate that a path is within repository bounds
 * Uses path.relative() to ensure target is actually inside repository,
 * not just a sibling path with matching prefix
 */
export function validatePath(repositoryPath: string, targetPath: string): boolean {
  const resolvedRepo = path.resolve(repositoryPath);
  const resolvedTarget = path.resolve(repositoryPath, targetPath);
  
  // Get relative path from repository to target
  const relativePath = path.relative(resolvedRepo, resolvedTarget);
  
  // If relative path is empty, target === repository root (allowed)
  // If relative path starts with '..' or is absolute, target is outside
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

/**
 * Check if a command is allowed for an agent
 */
export function isCommandAllowed(
  command: string,
  agentRole: "coordinator" | "architect" | "backend" | "test",
): boolean {
  const allowedCommands: Record<string, string[]> = {
    coordinator: [], // No command execution
    architect: ["git"], // Read-only git commands
    backend: ["git", "npm", "pnpm", "yarn", "node", "tsc", "npx"],
    test: ["git", "npm", "pnpm", "yarn", "node", "tsc", "npx", "pytest", "cargo", "go"],
  };

  const allowed = allowedCommands[agentRole] || [];
  return allowed.includes(command);
}

/**
 * Run verification commands
 */
export async function runVerification(
  repositoryPath: string,
  verificationType: "typecheck" | "test" | "build" | "custom",
  customCommand?: { command: string; args: string[] },
): Promise<CommandResult> {
  let command: string;
  let args: string[];

  switch (verificationType) {
    case "typecheck":
      // Try common typecheck commands
      command = "npx";
      args = ["tsc", "--noEmit"];
      break;
    case "test":
      // Try common test commands
      command = "npm";
      args = ["test", "--", "--run"];
      break;
    case "build":
      command = "npm";
      args = ["run", "build"];
      break;
    case "custom":
      if (!customCommand) {
        throw new Error("Custom command required for custom verification type");
      }
      command = customCommand.command;
      args = customCommand.args;
      break;
  }

  return executeCommand(command, args, {
    cwd: repositoryPath,
    timeout: 60000, // 60 seconds for verification
    agentRole: "test", // Verification always runs with test agent permissions
  });
}
