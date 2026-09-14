import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RepositoryProfile = {
  language: string;
  framework: string;
  packageManager: string;
  branch: string;
  gitStatus: string;
  lastScan: string;
};

async function fileExists(rootPath: string, fileName: string) {
  try {
    await access(path.join(rootPath, fileName));
    return true;
  } catch {
    return false;
  }
}

async function readPackage(rootPath: string) {
  try {
    return JSON.parse(
      await readFile(path.join(rootPath, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } catch {
    return {};
  }
}

async function readProjectDependencies(rootPath: string) {
  const packageLocations = [
    rootPath,
    path.join(rootPath, "apps", "web"),
    path.join(rootPath, "client"),
    path.join(rootPath, "frontend"),
    path.join(rootPath, "artifacts", "fetta"),
  ];
  const packages = await Promise.all(packageLocations.map(readPackage));
  return Object.assign({}, ...packages);
}

async function gitValue(rootPath: string, args: string[], fallback: string) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: rootPath,
      timeout: 3000,
    });
    return result.stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function scanRepository(rootPath: string): Promise<{
  profile: RepositoryProfile;
  status: "ready" | "needs_attention";
}> {
  const normalizedPath = path.resolve(rootPath);
  const packageJson = await readProjectDependencies(normalizedPath);
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  const hasPackage = await fileExists(normalizedPath, "package.json");
  const packageManager = (await fileExists(normalizedPath, "pnpm-lock.yaml"))
    ? "pnpm"
    : (await fileExists(normalizedPath, "yarn.lock"))
      ? "yarn"
      : (await fileExists(normalizedPath, "package-lock.json"))
        ? "npm"
        : (await fileExists(normalizedPath, "requirements.txt"))
          ? "pip"
          : "unknown";

  const language = (await fileExists(normalizedPath, "tsconfig.json"))
    ? "TypeScript"
    : (await fileExists(normalizedPath, "pyproject.toml"))
      ? "Python"
      : (await fileExists(normalizedPath, "Cargo.toml"))
        ? "Rust"
        : (await fileExists(normalizedPath, "go.mod"))
          ? "Go"
          : hasPackage
            ? "JavaScript"
            : "Unknown";

  const framework = dependencies["next"]
    ? "Next.js"
    : dependencies["vite"]
      ? "Vite"
      : dependencies["express"]
        ? "Express"
        : dependencies["fastify"]
          ? "Fastify"
          : dependencies["react"]
            ? "React"
            : "Undetected";

  const [branch, gitStatusRaw] = await Promise.all([
    gitValue(normalizedPath, ["branch", "--show-current"], "Not a Git repository"),
    gitValue(normalizedPath, ["status", "--short"], "Not a Git repository"),
  ]);
  const changedFiles = gitStatusRaw === "Not a Git repository"
    ? null
    : gitStatusRaw.split("\n").filter(Boolean).length;
  const gitStatus = changedFiles === null
    ? gitStatusRaw
    : changedFiles === 0
      ? "Clean"
      : `${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`;

  return {
    status: hasPackage || packageManager !== "unknown" ? "ready" : "needs_attention",
    profile: {
      language,
      framework,
      packageManager,
      branch,
      gitStatus,
      lastScan: new Date().toISOString(),
    },
  };
}