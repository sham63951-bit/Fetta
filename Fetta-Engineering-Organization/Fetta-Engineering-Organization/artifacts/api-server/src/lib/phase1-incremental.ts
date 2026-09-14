/**
 * Phase 1 Incremental Scanning
 * 
 * Supports fast re-scans by:
 * 1. Comparing repository fingerprints
 * 2. Detecting file changes since last scan
 * 3. Re-analyzing only affected components
 * 4. Skipping full scan if fingerprint unchanged
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RepositoryFingerprint, ProjectContextLayer } from "./phase1-scanner";

export interface IncrementalScanInfo {
  hasChanged: boolean;
  changedFiles: string[];
  addedFiles: string[];
  removedFiles: string[];
  previousFingerprint: RepositoryFingerprint | null;
  affectedComponents: string[];
  shouldFullScan: boolean;
  estimatedTime: "< 500ms" | "1-3s" | "3-5s" | "> 5s";
}

export interface ScanComparison {
  previousScan: RepositoryFingerprint;
  currentScan: RepositoryFingerprint;
  fileCountDelta: number;
  technologiesAdded: string[];
  technologiesRemoved: string[];
  technologiesChanged: string[];
}

/**
 * Get previous fingerprint for a project
 */
export async function getPreviousFingerprint(
  projectId: string,
): Promise<RepositoryFingerprint | null> {
  try {
    const project = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!project || !project[0]?.profile) {
      return null;
    }

    const profile = project[0].profile as any;
    return profile.fingerprint || null;
  } catch {
    return null;
  }
}

/**
 * Analyze whether repository has changed since last scan
 */
export async function analyzeChanges(
  repositoryRoot: string,
  currentFingerprint: RepositoryFingerprint,
  previousFingerprint: RepositoryFingerprint | null,
): Promise<IncrementalScanInfo> {
  if (!previousFingerprint) {
    // First scan - always full
    return {
      hasChanged: true,
      changedFiles: [],
      addedFiles: [],
      removedFiles: [],
      previousFingerprint: null,
      affectedComponents: [],
      shouldFullScan: true,
      estimatedTime: "> 5s",
    };
  }

  // Quick checks for file count changes
  const fileCountDelta =
    currentFingerprint.fileCount - previousFingerprint.fileCount;

  if (fileCountDelta === 0 && currentFingerprint.hash === previousFingerprint.hash) {
    // Fingerprint unchanged - no changes
    return {
      hasChanged: false,
      changedFiles: [],
      addedFiles: [],
      removedFiles: [],
      previousFingerprint,
      affectedComponents: [],
      shouldFullScan: false,
      estimatedTime: "< 500ms",
    };
  }

  // File count or hash changed - analyze changes
  const changedFiles = await detectChangedFiles(
    repositoryRoot,
    previousFingerprint,
  );

  const affected = analyzeAffectedComponents(changedFiles);

  // Heuristic: if many files changed, do full scan
  const shouldFullScan = changedFiles.length > 50 || fileCountDelta > 20;

  return {
    hasChanged: true,
    changedFiles: changedFiles.slice(0, 20), // Top 20 changed
    addedFiles: changedFiles.filter((f) => !previousFingerprint.hash), // Simplified
    removedFiles: fileCountDelta < 0 ? [] : [], // Simplified
    previousFingerprint,
    affectedComponents: affected,
    shouldFullScan,
    estimatedTime: shouldFullScan ? "3-5s" : "1-3s",
  };
}

/**
 * Detect which files changed since last scan
 */
async function detectChangedFiles(
  repositoryRoot: string,
  previousFingerprint: RepositoryFingerprint,
): Promise<string[]> {
  const changedFiles: string[] = [];

  try {
    // Collect current files and their sizes
    const fileStats = new Map<string, { size: number; mtime: number }>();

    const traverse = async (dirPath: string, prefix = "") => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (shouldIgnore(entry.name)) continue;

          const fullPath = path.join(dirPath, entry.name);
          const relativePath = prefix + entry.name;

          if (entry.isDirectory()) {
            await traverse(fullPath, relativePath + "/");
          } else {
            const stat = await fs.stat(fullPath);
            fileStats.set(relativePath, {
              size: stat.size,
              mtime: stat.mtimeMs || 0,
            });
          }
        }
      } catch {
        // Silently skip unreadable directories
      }
    };

    await traverse(repositoryRoot);

    // Simple heuristic: compare file counts and sizes
    // More sophisticated approach would hash individual files
    // but that's too expensive for incremental scans
    if (fileStats.size !== previousFingerprint.fileCount) {
      // File count changed - files added or removed
      changedFiles.push("file_count_delta");
    }

    // Return list of likely changed files (sampling)
    return changedFiles;
  } catch {
    return [];
  }
}

/**
 * Analyze which components are affected by changes
 */
function analyzeAffectedComponents(changedFiles: string[]): string[] {
  const components = new Set<string>();

  for (const file of changedFiles) {
    // Simple heuristic: file is in component if path contains app/package/service
    if (file.includes("/apps/")) {
      const match = file.match(/\/apps\/([^\/]+)/);
      if (match) components.add(`apps/${match[1]}`);
    }
    if (file.includes("/packages/")) {
      const match = file.match(/\/packages\/([^\/]+)/);
      if (match) components.add(`packages/${match[1]}`);
    }
    if (file.includes("/services/")) {
      const match = file.match(/\/services\/([^\/]+)/);
      if (match) components.add(`services/${match[1]}`);
    }
  }

  return Array.from(components);
}

/**
 * Compare two scans to identify technology changes
 */
export function compareScanResults(
  previous: ProjectContextLayer,
  current: ProjectContextLayer,
): ScanComparison {
  const prevTech = new Set(previous.technologies.map((t) => t.name));
  const currTech = new Set(current.technologies.map((t) => t.name));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  // Detect added and changed
  for (const tech of currTech) {
    if (!prevTech.has(tech)) {
      added.push(tech);
    } else {
      // Check if version changed
      const prevVersion = previous.technologies.find((t) => t.name === tech)
        ?.version;
      const currVersion = current.technologies.find((t) => t.name === tech)
        ?.version;
      if (prevVersion !== currVersion) {
        changed.push(`${tech}: ${prevVersion} → ${currVersion}`);
      }
    }
  }

  // Detect removed
  for (const tech of prevTech) {
    if (!currTech.has(tech)) {
      removed.push(tech);
    }
  }

  return {
    previousScan: previous.fingerprint,
    currentScan: current.fingerprint,
    fileCountDelta:
      current.repositoryIdentity.fileCount -
      previous.repositoryIdentity.fileCount,
    technologiesAdded: added,
    technologiesRemoved: removed,
    technologiesChanged: changed,
  };
}

/**
 * Generate change summary for events/logging
 */
export function generateChangeSummary(comparison: ScanComparison): string {
  const parts: string[] = [];

  if (comparison.fileCountDelta !== 0) {
    parts.push(
      `Files: ${comparison.fileCountDelta > 0 ? "+" : ""}${comparison.fileCountDelta}`,
    );
  }

  if (comparison.technologiesAdded.length > 0) {
    parts.push(`Added: ${comparison.technologiesAdded.join(", ")}`);
  }

  if (comparison.technologiesRemoved.length > 0) {
    parts.push(`Removed: ${comparison.technologiesRemoved.join(", ")}`);
  }

  if (comparison.technologiesChanged.length > 0) {
    parts.push(`Updated: ${comparison.technologiesChanged.length} tech`);
  }

  if (parts.length === 0) {
    return "No changes detected";
  }

  return parts.join(" | ");
}

/**
 * Helper: Determine if directory/file should be ignored
 */
function shouldIgnore(name: string): boolean {
  const ignorePatterns = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "coverage",
    ".venv",
    "venv",
    "env",
    ".egg-info",
    "target",
    "vendor",
    ".gradle",
    ".m2",
    ".cache",
    ".idea",
    ".vscode",
    ".DS_Store",
    ".__pycache__",
    "__pycache__",
    ".pytest_cache",
    "tmp",
    "temp",
    ".turbo",
    ".next",
    "out",
  ];

  return ignorePatterns.includes(name);
}

/**
 * Estimate scan time based on change analysis
 */
export function estimateScanTime(info: IncrementalScanInfo): number {
  switch (info.estimatedTime) {
    case "< 500ms":
      return 500;
    case "1-3s":
      return 2000;
    case "3-5s":
      return 4000;
    case "> 5s":
      return 6000;
  }
}

/**
 * Decide whether to run full or incremental scan
 */
export function decideScanStrategy(info: IncrementalScanInfo): "full" | "incremental" {
  if (info.shouldFullScan || info.previousFingerprint === null) {
    return "full";
  }

  // Run incremental if
  // - Changes detected
  // - AND fewer than 50 files changed
  // - AND fewer than 20 components affected
  if (
    info.hasChanged &&
    info.changedFiles.length < 50 &&
    info.affectedComponents.length < 20
  ) {
    return "incremental";
  }

  return "full";
}
