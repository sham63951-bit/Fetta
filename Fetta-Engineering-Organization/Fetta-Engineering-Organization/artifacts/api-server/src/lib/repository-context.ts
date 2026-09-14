import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FileInfo {
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface RepositoryContext {
  rootPath: string;
  files: FileInfo[];
  gitDiff?: string;
  gitBranch?: string;
  profile: {
    language: string;
    framework: string;
    packageManager: string;
  };
}

/**
 * List files in a directory recursively
 */
export async function listFiles(
  rootPath: string,
  pattern?: RegExp,
  maxDepth = 3,
  currentDepth = 0,
): Promise<FileInfo[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
  const files: FileInfo[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    // Skip common ignore patterns
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === ".next" ||
      entry.name === "coverage"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push({ path: relativePath, type: "directory" });
      const subFiles = await listFiles(fullPath, pattern, maxDepth, currentDepth + 1);
      files.push(...subFiles.map((f) => ({ ...f, path: path.join(relativePath, f.path) })));
    } else if (entry.isFile()) {
      const fileStat = await stat(fullPath).catch(() => null);
      if (!pattern || pattern.test(entry.name)) {
        files.push({
          path: relativePath,
          type: "file",
          size: fileStat?.size,
        });
      }
    }
  }

  return files;
}

/**
 * Read file content
 */
export async function readFileContent(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const fullPath = path.join(rootPath, relativePath);
  return readFile(fullPath, "utf8");
}

/**
 * Get git diff of uncommitted changes
 */
export async function getGitDiff(rootPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "HEAD"], {
      cwd: rootPath,
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get current git branch
 */
export async function getGitBranch(rootPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], {
      cwd: rootPath,
      timeout: 3000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Build context message for AI provider
 */
export function buildContextMessage(context: RepositoryContext): string {
  const fileTree = context.files
    .filter((f) => f.type === "file")
    .slice(0, 100) // Limit to first 100 files
    .map((f) => `  - ${f.path}${f.size ? ` (${Math.round(f.size / 1024)}kb)` : ""}`)
    .join("\n");

  let message = `Repository: ${context.rootPath}

Stack:
- Language: ${context.profile.language}
- Framework: ${context.profile.framework}
- Package Manager: ${context.profile.packageManager}

File Structure (partial):
${fileTree}
`;

  if (context.gitBranch) {
    message += `\nGit Branch: ${context.gitBranch}`;
  }

  if (context.gitDiff) {
    const diffPreview = context.gitDiff.slice(0, 2000);
    message += `\n\nUncommitted Changes:\n\`\`\`diff\n${diffPreview}${context.gitDiff.length > 2000 ? "\n... (truncated)" : ""}\n\`\`\``;
  }

  return message;
}

/**
 * Write file content
 */
export async function writeFileContent(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = path.join(rootPath, relativePath);
  const { writeFile, mkdir } = await import("node:fs/promises");
  
  // Ensure directory exists
  const dir = path.dirname(fullPath);
  await mkdir(dir, { recursive: true });
  
  await writeFile(fullPath, content, "utf8");
}
