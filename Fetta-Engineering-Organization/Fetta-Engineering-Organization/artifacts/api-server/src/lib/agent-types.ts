/**
 * Structured result types for agent handoffs
 */

export interface CoordinatorResult {
  action: "delegate" | "complete" | "blocked";
  targetAgent?: "architect" | "backend" | "test";
  reason: string;
  plan: string;
  requiredContext: string[];
  verificationRequirements: string[];
}

export interface ArchitectResult {
  summary: string;
  findings: string[];
  affectedFiles: string[];
  implementationPlan: {
    steps: string[];
    technicalApproach: string;
    codeLocation: string;
  };
  risks: string[];
  verificationPlan: string[];
}

export interface EngineerResult {
  summary: string;
  filesModified: Array<{
    path: string;
    action: "create" | "modify" | "delete";
  }>;
  implementationDetails: string;
  commandsRun: Array<{
    command: string;
    exitCode: number;
    output: string;
  }>;
}

export interface TestResult {
  passed: boolean;
  evidence: {
    verificationType: string;
    command?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    filesVerified: string[];
    timestamp: string;
  };
  summary: string;
  failures?: string[];
}

export interface AgentContext {
  projectId: string;
  taskId: string;
  objective: string;
  repositoryPath: string;
  previousResults?: {
    coordinator?: CoordinatorResult;
    architect?: ArchitectResult;
    engineer?: EngineerResult;
  };
  projectMemory?: Array<{
    type: string;
    title: string;
    content: string;
  }>;
}
