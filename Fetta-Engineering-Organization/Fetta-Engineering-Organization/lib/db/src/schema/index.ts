import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repositoryPath: text("repository_path").notNull(),
  status: text("status").notNull(),
  profile: jsonb("profile").$type<{
    language: string;
    framework: string;
    packageManager: string;
    branch: string;
    gitStatus: string;
    lastScan: string;
  }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const agentDefinitionsTable = pgTable("agent_definitions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  currentActivity: text("current_activity").notNull(),
  accent: text("accent").notNull(),
});

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  ownerAgent: text("owner_agent").notNull(),
  status: text("status").notNull(),
  verificationState: text("verification_state").notNull(),
  summary: text("summary"),
  verificationEvidence: jsonb("verification_evidence").$type<{
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
    filesModified: string[];
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const memoriesTable = pgTable("memories", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  confidence: text("confidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const eventsTable = pgTable("events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  type: text("type").notNull(),
  agent: text("agent").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const agentRunsTable = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  taskId: text("task_id").notNull(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  status: text("status").notNull(), // running, completed, failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  input: jsonb("input").$type<Record<string, unknown>>(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  error: text("error"),
  metadata: jsonb("metadata").$type<{
    model?: string;
    tokensUsed?: number;
    duration?: number;
  }>(),
});