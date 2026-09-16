import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, open, readFile, rm, stat, writeFile, rename } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import type { IncomingMessage } from "node:http";

const DEFAULT_MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_EXPANDED_BYTES = 5 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_FILES = 250_000;

const storageRoot = path.resolve(
  process.env.MERCURY_STORAGE_ROOT ?? path.join(process.cwd(), "mercury-projects"),
);

export type MercuryPhase =
  | "UPLOADING"
  | "VALIDATING"
  | "EXTRACTING"
  | "DISCOVERING"
  | "INDEXING"
  | "READY"
  | "FAILED";

export type MercuryFileClassification =
  | "SOURCE"
  | "TEST"
  | "CONFIG"
  | "DOCUMENTATION"
  | "GENERATED"
  | "BUILD_OUTPUT"
  | "DEPENDENCY"
  | "BINARY"
  | "UNKNOWN";

export type MercuryFileRecord = {
  id: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  contentHash: string;
  language: string;
  text: boolean;
  classification: MercuryFileClassification;
  ignored: boolean;
  ignoreReason?: string;
  indexingStatus: "indexed" | "ignored";
};

export type MercuryStatus = {
  ingestionId: string;
  phase: MercuryPhase;
  archiveName: string;
  archiveBytes: number;
  filesDiscovered: number;
  filesIndexed: number;
  filesIgnored: number;
  expandedBytes: number;
  elapsedMs: number;
  throughputFilesPerSecond: number;
  error?: string;
  updatedAt: string;
};

export type MercuryManifest = {
  version: 1;
  ingestionId: string;
  createdAt: string;
  source: {
    archiveName: string;
    sourcePath: string;
  };
  readiness: {
    core: "ready";
    secondary: "complete";
    timeToCoreReadyMs: number;
    timeToFullIndexMs: number;
  };
  metrics: {
    archiveBytes: number;
    expandedBytes: number;
    fileCount: number;
    indexedFiles: number;
    ignoredFiles: number;
    throughputFilesPerSecond: number;
  };
  filesIndexPath: string;
  structurePath: string;
  dependenciesPath: string;
  signals: {
    languages: string[];
    packageManagers: string[];
    manifests: string[];
    monorepo: boolean;
  };
  structure: {
    directories: string[];
    sourceDirectories: string[];
    testDirectories: string[];
    configurationDirectories: string[];
    documentationDirectories: string[];
    buildDirectories: string[];
    projectRoots: string[];
  };
  intellimemBoundary: {
    emitted: "deterministic_observations_only";
    doesNotContain: ["meaning", "decisions", "history", "agent_reasoning"];
  };
};

type ExtractionEntry = {
  archivePath: string;
  relativePath: string;
};

type Limits = {
  maxArchiveBytes: number;
  maxExpandedBytes: number;
  maxFileBytes: number;
  maxFiles: number;
};

function numberLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const limits: Limits = {
  maxArchiveBytes: numberLimit("MERCURY_MAX_ARCHIVE_BYTES", DEFAULT_MAX_ARCHIVE_BYTES),
  maxExpandedBytes: numberLimit("MERCURY_MAX_EXPANDED_BYTES", DEFAULT_MAX_EXPANDED_BYTES),
  maxFileBytes: numberLimit("MERCURY_MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES),
  maxFiles: numberLimit("MERCURY_MAX_FILES", DEFAULT_MAX_FILES),
};

function projectDirectory(ingestionId: string) {
  return path.join(storageRoot, ingestionId);
}

function statusFile(ingestionId: string) {
  return path.join(projectDirectory(ingestionId), "mercury", "status.json");
}

async function writeJson(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryPath, filePath);
}

async function writeStatus(ingestionId: string, patch: Partial<MercuryStatus>) {
  const current = await getMercuryStatus(ingestionId);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(statusFile(ingestionId), next);
  return next;
}

export async function getMercuryStatus(ingestionId: string): Promise<MercuryStatus> {
  return JSON.parse(await readFile(statusFile(ingestionId), "utf8")) as MercuryStatus;
}

export async function getMercuryManifest(ingestionId: string): Promise<MercuryManifest> {
  const filePath = path.join(projectDirectory(ingestionId), "mercury", "manifest.json");
  return JSON.parse(await readFile(filePath, "utf8")) as MercuryManifest;
}

async function runCommand(command: string, args: string[], timeoutMs = 60_000) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function safeArchivePath(entry: string) {
  const replaced = entry.replaceAll("\\", "/").replace(/\0/g, "");
  if (!replaced || replaced.startsWith("/") || /^[A-Za-z]:\//.test(replaced)) {
    throw new Error(`Unsafe archive path: ${entry}`);
  }
  const normalized = path.posix.normalize(replaced).replace(/^(\.\/)+/, "");
  if (!normalized || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Path traversal detected: ${entry}`);
  }
  return normalized;
}

async function persistArchive(
  request: IncomingMessage,
  archivePath: string,
  maxBytes: number,
) {
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        callback(new Error(`Archive exceeds the ${maxBytes} byte limit`));
        return;
      }
      callback(null, chunk);
    },
  });
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(archivePath, { flags: "wx" });
    output.once("finish", resolve);
    output.once("error", reject);
    limiter.once("error", reject);
    request.once("error", reject);
    request.pipe(limiter).pipe(output);
  });
  return received;
}

async function extractEntry(
  archivePath: string,
  entry: ExtractionEntry,
  destinationRoot: string,
  maxFileBytes: number,
  total: { bytes: number },
) {
  const destination = path.join(destinationRoot, entry.relativePath);
  const resolvedDestination = path.resolve(destination);
  if (!resolvedDestination.startsWith(`${path.resolve(destinationRoot)}${path.sep}`)) {
    throw new Error(`Extraction escaped source root: ${entry.archivePath}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });

  const child = spawn("unzip", ["-p", archivePath, entry.archivePath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });

  const output = createWriteStream(destination, { flags: "wx" });
  const hash = createHash("sha256");
  const outputClosed = once(output, "close");
  const childClosed = new Promise<number>((resolve) => {
    child.once("close", (code) => resolve(code ?? 1));
  });
  let fileBytes = 0;
  try {
    for await (const chunk of child.stdout) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      fileBytes += buffer.length;
      total.bytes += buffer.length;
      if (fileBytes > maxFileBytes) {
        child.kill("SIGKILL");
        throw new Error(`File exceeds the ${maxFileBytes} byte limit: ${entry.relativePath}`);
      }
      if (total.bytes > limits.maxExpandedBytes) {
        child.kill("SIGKILL");
        throw new Error(`Expanded archive exceeds the ${limits.maxExpandedBytes} byte limit`);
      }
      hash.update(buffer);
      if (!output.write(buffer)) await once(output, "drain");
    }
    output.end();
    await outputClosed;
    const exitCode = await childClosed;
    if (exitCode !== 0) throw new Error(stderr.trim() || `Unable to extract ${entry.relativePath}`);
    return { bytes: fileBytes, contentHash: hash.digest("hex") };
  } catch (error) {
    child.kill("SIGKILL");
    output.destroy();
    await rm(destination, { force: true });
    throw error;
  }
}

const languageByExtension: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".mjs": "JavaScript", ".cjs": "JavaScript", ".py": "Python", ".go": "Go",
  ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby", ".php": "PHP",
  ".cs": "C#", ".cpp": "C++", ".c": "C", ".h": "C/C++", ".css": "CSS", ".scss": "SCSS",
  ".html": "HTML", ".vue": "Vue", ".svelte": "Svelte", ".sql": "SQL", ".sh": "Shell",
};

const binaryExtensions = new Set([
  ".7z", ".avi", ".bmp", ".class", ".dll", ".dmg", ".doc", ".docx", ".exe", ".gif",
  ".ico", ".jpeg", ".jpg", ".mov", ".mp3", ".mp4", ".pdf", ".png", ".so", ".tar", ".woff",
  ".woff2", ".xlsx", ".zip",
]);

const commonIgnoredDirectories: Record<string, string> = {
  ".git": "version-control metadata",
  ".hg": "version-control metadata",
  ".svn": "version-control metadata",
  "node_modules": "dependency directory",
  "vendor": "dependency directory",
  ".next": "framework build output",
  "dist": "build output",
  "build": "build output",
  "coverage": "test output",
  ".cache": "cache directory",
  "target": "build output",
};

function pathMatchesGitignore(relativePath: string, rules: string[]) {
  return rules.some((rawRule) => {
    const rule = rawRule.trim().replace(/^\/+|\/+$/g, "");
    if (!rule || rule.startsWith("#") || rule.startsWith("!")) return false;
    const regex = new RegExp(
      `(^|/)${rule.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}($|/)`,
    );
    return regex.test(relativePath);
  });
}

async function isTextFile(filePath: string, extension: string) {
  if (binaryExtensions.has(extension)) return false;
  const handle = await open(filePath, "r");
  try {
    const sample = Buffer.alloc(4096);
    const result = await handle.read(sample, 0, sample.length, 0);
    return !result.buffer.subarray(0, result.bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

function classify(relativePath: string, text: boolean): MercuryFileClassification {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  if (/(^|\/)(dist|build|target|coverage|\.next)(\/|$)/.test(normalized)) return "BUILD_OUTPUT";
  if (/(^|\/)(generated|gen)(\/|$)|\.generated\./.test(normalized)) return "GENERATED";
  if (/(^|\/)(node_modules|vendor)(\/|$)/.test(normalized)) return "DEPENDENCY";
  if (/(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\.[^.]+$/.test(normalized)) return "TEST";
  if (/(^|\/)(docs?|documentation)(\/|$)|\.(md|mdx|rst|txt)$/.test(normalized)) return "DOCUMENTATION";
  if (
    /(^|\/)(\.env|dockerfile|makefile|vite\.config|next\.config|tsconfig|webpack|eslint|prettier|jest|pyproject|cargo|go\.mod)/.test(filename) ||
    /\.(json|yaml|yml|toml|ini|lock|xml|conf|config)$/.test(filename)
  ) return "CONFIG";
  if (!text) return "BINARY";
  if (languageByExtension[path.posix.extname(filename)]) return "SOURCE";
  return "UNKNOWN";
}

function languageFor(relativePath: string) {
  return languageByExtension[path.posix.extname(relativePath).toLowerCase()] ?? "Unknown";
}

async function buildFileRecord(
  sourceRoot: string,
  entry: ExtractionEntry,
  extraction: { bytes: number; contentHash: string },
  gitignoreRules: string[],
): Promise<MercuryFileRecord> {
  const relativePath = entry.relativePath;
  const extension = path.posix.extname(relativePath).toLowerCase();
  const ignoredDirectory = Object.keys(commonIgnoredDirectories).find((directory) =>
    relativePath === directory || relativePath.startsWith(`${directory}/`) || relativePath.includes(`/${directory}/`),
  );
  const gitignored = pathMatchesGitignore(relativePath, gitignoreRules);
  const ignoreReason = ignoredDirectory
    ? commonIgnoredDirectories[ignoredDirectory]
    : gitignored ? ".gitignore rule" : undefined;
  const ignored = Boolean(ignoreReason);
  const text = await isTextFile(path.join(sourceRoot, relativePath), extension);
  return {
    id: createHash("sha1").update(relativePath).digest("hex"),
    relativePath,
    filename: path.posix.basename(relativePath),
    extension,
    size: extraction.bytes,
    contentHash: extraction.contentHash,
    language: languageFor(relativePath),
    text,
    classification: classify(relativePath, text),
    ignored,
    ignoreReason,
    indexingStatus: ignored ? "ignored" : "indexed",
  };
}

async function parseDependencies(sourceRoot: string, records: MercuryFileRecord[]) {
  const manifests = records.filter((record) =>
    !record.ignored && ["package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "composer.json"].includes(record.filename),
  );
  const dependencies: Array<{ manifest: string; packageManager: string; dependencies: Record<string, string> }> = [];
  for (const manifest of manifests.slice(0, 30)) {
    const filePath = path.join(sourceRoot, manifest.relativePath);
    if (manifest.filename === "package.json" || manifest.filename === "composer.json") {
      try {
        const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
        const dependencyGroups = ["dependencies", "devDependencies", "require"];
        const values: Record<string, string> = {};
        for (const group of dependencyGroups) {
          const groupValue = parsed[group];
          if (groupValue && typeof groupValue === "object") {
            for (const [name, version] of Object.entries(groupValue as Record<string, unknown>)) {
              if (typeof version === "string") values[name] = version;
            }
          }
        }
        dependencies.push({
          manifest: manifest.relativePath,
          packageManager: manifest.filename === "package.json" ? "npm-compatible" : "composer",
          dependencies: values,
        });
      } catch {
        dependencies.push({ manifest: manifest.relativePath, packageManager: "unknown", dependencies: {} });
      }
    } else {
      dependencies.push({ manifest: manifest.relativePath, packageManager: "detected", dependencies: {} });
    }
  }
  return dependencies;
}

function buildStructure(records: MercuryFileRecord[]) {
  const directories = new Set<string>();
  for (const record of records) {
    const parts = record.relativePath.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }
  const list = [...directories].sort();
  return {
    directories: list,
    sourceDirectories: list.filter((directory) => /(^|\/)(src|lib|app|apps|packages)(\/|$)/i.test(directory)),
    testDirectories: list.filter((directory) => /(^|\/)(test|tests|spec|__tests__)(\/|$)/i.test(directory)),
    configurationDirectories: list.filter((directory) => /(^|\/)(config|configs|\.github|\.vscode)(\/|$)/i.test(directory)),
    documentationDirectories: list.filter((directory) => /(^|\/)(docs?|documentation)(\/|$)/i.test(directory)),
    buildDirectories: list.filter((directory) => /(^|\/)(dist|build|target|coverage|\.next)(\/|$)/i.test(directory)),
    projectRoots: list.filter((directory) => /(^|\/)(apps|packages|services|projects)(\/|$)/i.test(directory)),
  };
}

async function processArchive(
  ingestionId: string,
  archiveName: string,
  archivePath: string,
  startedAt: number,
) {
  const root = projectDirectory(ingestionId);
  const sourceRoot = path.join(root, "source");
  const mercuryRoot = path.join(root, "mercury");
  const total = { bytes: 0 };

  try {
    await writeStatus(ingestionId, { phase: "VALIDATING" });
    const archiveStats = await stat(archivePath);
    await runCommand("unzip", ["-tqq", archivePath], 120_000);
    const listing = await runCommand("zipinfo", ["-1", archivePath], 120_000);
    const entries: ExtractionEntry[] = [];
    const seen = new Set<string>();
    for (const rawEntry of listing.stdout.split(/\r?\n/).filter(Boolean)) {
      if (rawEntry.endsWith("/")) continue;
      const relativePath = safeArchivePath(rawEntry);
      if (seen.has(relativePath)) throw new Error(`Duplicate archive path: ${relativePath}`);
      seen.add(relativePath);
      entries.push({ archivePath: rawEntry, relativePath });
      if (entries.length > limits.maxFiles) throw new Error(`Archive exceeds the ${limits.maxFiles} file limit`);
    }
    await writeStatus(ingestionId, {
      phase: "DISCOVERING",
      archiveBytes: archiveStats.size,
      filesDiscovered: entries.length,
    });

    const extracted = new Map<string, { bytes: number; contentHash: string }>();
    const records: MercuryFileRecord[] = [];
    const gitignoreRules: string[] = [];
    for (const [index, entry] of entries.entries()) {
      await writeStatus(ingestionId, {
        phase: "EXTRACTING",
        filesDiscovered: entries.length,
        filesIndexed: index,
        expandedBytes: total.bytes,
      });
      const result = await extractEntry(archivePath, entry, sourceRoot, limits.maxFileBytes, total);
      extracted.set(entry.relativePath, result);
      if (entry.relativePath === ".gitignore") {
        const rules = await readFile(path.join(sourceRoot, entry.relativePath), "utf8");
        gitignoreRules.push(...rules.split(/\r?\n/));
      }
    }

    await writeStatus(ingestionId, { phase: "INDEXING", expandedBytes: total.bytes });
    for (const entry of entries) {
      const record = await buildFileRecord(sourceRoot, entry, extracted.get(entry.relativePath)!, gitignoreRules);
      records.push(record);
      await writeStatus(ingestionId, {
        phase: "INDEXING",
        filesIndexed: records.filter((item) => !item.ignored).length,
        filesIgnored: records.filter((item) => item.ignored).length,
        expandedBytes: total.bytes,
      });
    }

    const structure = buildStructure(records);
    const dependencies = await parseDependencies(sourceRoot, records);
    const languages = [...new Set(records.filter((record) => !record.ignored).map((record) => record.language).filter((language) => language !== "Unknown"))].sort();
    const packageManagers = [...new Set(records.filter((record) => !record.ignored).flatMap((record) => {
      if (record.filename === "pnpm-lock.yaml") return ["pnpm"];
      if (record.filename === "yarn.lock") return ["yarn"];
      if (record.filename === "package-lock.json") return ["npm"];
      if (record.filename === "bun.lock" || record.filename === "bun.lockb") return ["bun"];
      if (record.filename === "requirements.txt" || record.filename === "pyproject.toml") return ["pip"];
      if (record.filename === "Cargo.lock" || record.filename === "Cargo.toml") return ["cargo"];
      if (record.filename === "go.mod") return ["go"];
      return [];
    }))].sort();
    const manifestNames = [...new Set(records.filter((record) => !record.ignored && ["package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "composer.json"].includes(record.filename)).map((record) => record.relativePath))].sort();
    const now = new Date().toISOString();
    const elapsedMs = Date.now() - startedAt;
    const indexedFiles = records.filter((record) => !record.ignored).length;
    const ignoredFiles = records.length - indexedFiles;
    const manifest: MercuryManifest = {
      version: 1,
      ingestionId,
      createdAt: now,
      source: { archiveName, sourcePath: sourceRoot },
      readiness: {
        core: "ready",
        secondary: "complete",
        timeToCoreReadyMs: elapsedMs,
        timeToFullIndexMs: elapsedMs,
      },
      metrics: {
        archiveBytes: archiveStats.size,
        expandedBytes: total.bytes,
        fileCount: records.length,
        indexedFiles,
        ignoredFiles,
        throughputFilesPerSecond: records.length / Math.max(elapsedMs / 1000, 0.001),
      },
      filesIndexPath: "mercury/files.json",
      structurePath: "mercury/structure.json",
      dependenciesPath: "mercury/dependencies.json",
      signals: {
        languages,
        packageManagers,
        manifests: manifestNames,
        monorepo: Boolean(records.find((record) => record.filename === "pnpm-workspace.yaml" || record.filename === "lerna.json")),
      },
      structure,
      intellimemBoundary: {
        emitted: "deterministic_observations_only",
        doesNotContain: ["meaning", "decisions", "history", "agent_reasoning"],
      },
    };
    await writeJson(path.join(mercuryRoot, "files.json"), records);
    await writeJson(path.join(mercuryRoot, "structure.json"), structure);
    await writeJson(path.join(mercuryRoot, "dependencies.json"), dependencies);
    await writeJson(path.join(mercuryRoot, "manifest.json"), manifest);
    await writeStatus(ingestionId, {
      phase: "READY",
      filesDiscovered: records.length,
      filesIndexed: indexedFiles,
      filesIgnored: ignoredFiles,
      expandedBytes: total.bytes,
      elapsedMs,
      throughputFilesPerSecond: manifest.metrics.throughputFilesPerSecond,
    });
  } catch (error) {
    await writeStatus(ingestionId, {
      phase: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    });
    await rm(archivePath, { force: true });
  }
}

export async function startMercuryIngestion(
  request: IncomingMessage,
  archiveName: string,
) {
  const ingestionId = randomUUID();
  const root = projectDirectory(ingestionId);
  const archivePath = path.join(root, "upload", "repository.zip");
  await mkdir(path.dirname(archivePath), { recursive: true });
  await mkdir(path.join(root, "source"), { recursive: true });
  await mkdir(path.join(root, "mercury"), { recursive: true });
  const initialStatus: MercuryStatus = {
    ingestionId,
    phase: "UPLOADING",
    archiveName,
    archiveBytes: 0,
    filesDiscovered: 0,
    filesIndexed: 0,
    filesIgnored: 0,
    expandedBytes: 0,
    elapsedMs: 0,
    throughputFilesPerSecond: 0,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(statusFile(ingestionId), initialStatus);
  try {
    const archiveBytes = await persistArchive(request, archivePath, limits.maxArchiveBytes);
    await writeStatus(ingestionId, { phase: "VALIDATING", archiveBytes });
    void processArchive(ingestionId, archiveName, archivePath, Date.now());
    return { ingestionId, status: "VALIDATING" as const, archiveBytes };
  } catch (error) {
    await writeStatus(ingestionId, {
      phase: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}