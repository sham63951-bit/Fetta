/**
 * Phase 1 Persistence Layer
 * 
 * Stores ProjectContextLayer results in database for future agent consumption
 * Extends existing projects table and uses memoriesTable for structured findings
 */

import { randomUUID } from "node:crypto";
import { db, projectsTable, memoriesTable, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { ProjectContextLayer } from "./phase1-scanner";

export interface Phase1ScanResult {
  projectId: string;
  scanId: string;
  contextLayer: ProjectContextLayer;
  persistedAt: string;
}

/**
 * Persist Phase 1 scan results to database
 */
export async function persistPhase1Context(
  projectId: string,
  contextLayer: ProjectContextLayer,
): Promise<Phase1ScanResult> {
  const scanId = randomUUID();
  const persistedAt = new Date().toISOString();

  // 1. Update projects table with enriched profile
  const enrichedProfile = {
    // Keep existing fields
    language: contextLayer.repositoryIdentity.fileCount > 0 ? "Mixed" : "Unknown",
    framework: "Unknown",
    packageManager: "Unknown",
    branch: contextLayer.gitContext.branch || "unknown",
    gitStatus: contextLayer.gitContext.dirty ? "Dirty" : "Clean",
    lastScan: persistedAt,
    
    // Add Phase 1 data
    phase1_context: {
      scanId,
      version: contextLayer.scan.version,
      duration: contextLayer.scan.durationMs,
      filesScanned: contextLayer.scan.filesScanned,
      fileCount: contextLayer.repositoryIdentity.fileCount,
      directoryCount: contextLayer.repositoryIdentity.directoryCount,
      repositoryRoot: contextLayer.repositoryIdentity.root,
      repositoryName: contextLayer.repositoryIdentity.repositoryName,
      entryPoints: contextLayer.entryPoints,
      components: contextLayer.components,
      fingerprint: contextLayer.fingerprint,
    },
    
    technologies: contextLayer.technologies.map((t) => ({
      name: t.name,
      category: t.category,
      version: t.version,
      confidence: t.confidence,
    })),
    
    structure_classification: contextLayer.structure.classification,
    has_workspaces: contextLayer.structure.hasWorkspaces,
    workspace_type: contextLayer.structure.workspaceType,
  };

  // Update or insert project record
  const now = new Date();
  await db
    .insert(projectsTable)
    .values({
      id: projectId,
      name: contextLayer.repositoryIdentity.repositoryName,
      repositoryPath: contextLayer.repositoryIdentity.root,
      status: "ready",
      profile: enrichedProfile as any,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: projectsTable.id,
      set: {
        profile: enrichedProfile as any,
        status: "ready",
        updatedAt: now,
      },
    });

  // 2. Store key findings as memories for agent access
  const memories = [
    // Repository identity
    {
      id: `${projectId}:phase1:identity`,
      projectId,
      type: "fact" as const,
      title: "Repository Identity",
      content: `Repository: ${contextLayer.repositoryIdentity.repositoryName}\nPath: ${contextLayer.repositoryIdentity.normalizedPath}\nFiles: ${contextLayer.repositoryIdentity.fileCount}\nDirectories: ${contextLayer.repositoryIdentity.directoryCount}`,
      source: "Phase 1 scanner",
      confidence: "high" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },

    // Technologies
    {
      id: `${projectId}:phase1:technologies`,
      projectId,
      type: "fact" as const,
      title: "Detected Technologies",
      content: contextLayer.technologies
        .filter((t) => t.confidence > 0.8)
        .map(
          (t) =>
            `${t.name}${t.version ? ` (${t.version})` : ""} - ${t.category}`,
        )
        .join("\n"),
      source: "Phase 1 scanner",
      confidence: "high" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },

    // Repository structure
    {
      id: `${projectId}:phase1:structure`,
      projectId,
      type: "convention" as const,
      title: "Repository Structure",
      content: `Classification: ${contextLayer.structure.classification}\nWorkspaces: ${contextLayer.structure.hasWorkspaces ? `Yes (${contextLayer.structure.workspaceType})` : "No"}`,
      source: "Phase 1 scanner",
      confidence: "high" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },

    // Components
    ...(contextLayer.components.length > 0
      ? [
          {
            id: `${projectId}:phase1:components`,
            projectId,
            type: "fact" as const,
            title: "Project Components",
            content: contextLayer.components
              .map(
                (c) =>
                  `${c.id} (${c.type}): ${c.technologies.join(", ") || "no specific tech"}`,
              )
              .join("\n"),
            source: "Phase 1 scanner",
            confidence: "high" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]
      : []),

    // Entry points
    ...(contextLayer.entryPoints.length > 0
      ? [
          {
            id: `${projectId}:phase1:entry_points`,
            projectId,
            type: "fact" as const,
            title: "Entry Points Detected",
            content: contextLayer.entryPoints
              .map((e) => `${e.type}: ${e.path}`)
              .join("\n"),
            source: "Phase 1 scanner",
            confidence: "high" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]
      : []),

    // Database context
    ...(contextLayer.databaseContext.detected
      ? [
          {
            id: `${projectId}:phase1:database`,
            projectId,
            type: "fact" as const,
            title: "Database Technology",
            content: `ORMs: ${contextLayer.databaseContext.orms.map((o) => o.name).join(", ") || "None detected"}\nMigrations: ${contextLayer.databaseContext.migrationsPath || "Not found"}`,
            source: "Phase 1 scanner",
            confidence: "high" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]
      : []),

    // Git context
    {
      id: `${projectId}:phase1:git`,
      projectId,
      type: "convention" as const,
      title: "Git Repository Status",
      content: `Git: ${contextLayer.gitContext.isRepository ? `Yes (${contextLayer.gitContext.branch})` : "No"}\nStatus: ${contextLayer.gitContext.dirty ? "Dirty" : "Clean"}${contextLayer.gitContext.changedFilesCount ? ` (${contextLayer.gitContext.changedFilesCount} changed)` : ""}`,
      source: "Phase 1 scanner",
      confidence: "high" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },

    // Scan metadata
    {
      id: `${projectId}:phase1:scan_metadata`,
      projectId,
      type: "decision" as const,
      title: "Phase 1 Scan Summary",
      content: `Duration: ${contextLayer.scan.durationMs}ms\nFiles Scanned: ${contextLayer.scan.filesScanned}\nSkipped: ${contextLayer.scan.filesSkipped}\nBytes: ${contextLayer.scan.bytesScanned}\nErrors: ${contextLayer.scan.errors.length}`,
      source: "Phase 1 scanner",
      confidence: "high" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  // Insert or update memories one at a time to avoid parameter bind limit
  for (const memory of memories) {
    // Try to delete existing memory first to ensure clean insert
    // Use raw SQL to avoid conflicts
    try {
      await db.delete(memoriesTable).where(eq(memoriesTable.id, memory.id));
    } catch {
      // Ignore delete errors if record doesn't exist
    }
    
    await db.insert(memoriesTable).values(memory as any);
  }

  // 3. Record event
  await db.insert(eventsTable).values({
    id: randomUUID(),
    projectId,
    type: "phase1.scan_completed",
    agent: "Phase1Scanner",
    message: `Phase 1 scan completed in ${contextLayer.scan.durationMs}ms. Found ${contextLayer.technologies.length} technologies, ${contextLayer.components.length} components, ${contextLayer.entryPoints.length} entry points.`,
    createdAt: new Date(),
  });

  return {
    projectId,
    scanId,
    contextLayer,
    persistedAt,
  };
}

/**
 * Retrieve Phase 1 context for a project
 */
export async function retrievePhase1Context(
  projectId: string,
): Promise<ProjectContextLayer | null> {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!project || !project[0]?.profile) {
    return null;
  }

  const profile = project[0].profile as any;

  // Reconstruct basic context from stored profile
  // Full context would require full storage implementation
  // For now, this returns what was persisted
  return profile.phase1_context
    ? {
        repositoryIdentity: {
          root: profile.phase1_context?.repositoryRoot || project[0].repositoryPath,
          normalizedPath: profile.phase1_context?.repositoryRoot || project[0].repositoryPath,
          repositoryName: profile.phase1_context?.repositoryName || project[0].name,
          fileCount: profile.phase1_context.fileCount || 0,
          directoryCount: profile.phase1_context.directoryCount || 0,
        },
        technologies: profile.technologies || [],
        structure: {
          root: {
            path: profile.phase1_context?.repositoryRoot || project[0].repositoryPath,
            name: profile.phase1_context?.repositoryName || project[0].name,
            type: "directory",
            children: [],
            isSourceDirectory: true,
          },
          classification: profile.structure_classification || "unknown",
          hasWorkspaces: profile.has_workspaces || false,
          workspaceType: profile.workspace_type,
        },
        components: profile.phase1_context?.components || [],
        entryPoints: profile.phase1_context?.entryPoints || [],
        databaseContext: {
          detected: false,
          orms: [],
          schemaFiles: [],
          seedFiles: [],
          configurationFiles: [],
        },
        configurationContext: {
          environmentFiles: [],
          configurationFiles: [],
          secretsIdentified: [],
        },
        gitContext: {
          isRepository: true,
          branch: profile.branch,
          dirty: profile.gitStatus === "Dirty",
          remotePresent: false,
        },
        scan: {
          startedAt: profile.lastScan,
          completedAt: profile.lastScan,
          durationMs: profile.phase1_context.duration || 0,
          version: profile.phase1_context.version || "1",
          filesScanned: profile.phase1_context.filesScanned || 0,
          filesSkipped: profile.phase1_context.filesSkipped || 0,
          bytesScanned: 0,
          errors: [],
        },
        fingerprint: profile.phase1_context?.fingerprint || {
          version: "1",
          timestamp: profile.lastScan,
          fileCount: profile.phase1_context?.fileCount || 0,
          directoryCount: profile.phase1_context?.directoryCount || 0,
          hash: "",
          languages: [],
          frameworks: [],
        },
      }
    : null;
}

/**
 * Check if project has Phase 1 context
 */
export async function hasPhase1Context(projectId: string): Promise<boolean> {
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!project || !project[0]?.profile) {
    return false;
  }

  const profile = project[0].profile as any;
  return !!profile.phase1_context;
}
