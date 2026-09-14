/**
 * Phase 1: Lightning-Fast Repository Intake Scanner
 * 
 * Deterministic repository analysis WITHOUT LLM
 * - Single filesystem traversal
 * - Technology detection via patterns
 * - Structure analysis via directory classification
 * - Entry point detection
 * - Database intelligence
 * - Git context
 * 
 * Zero LLM calls. Zero agent invocations.
 * Performance target: < 5 seconds cold, < 500ms warm
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ProjectContextLayer {
  repositoryIdentity: RepositoryIdentity;
  technologies: DetectedTechnology[];
  structure: RepositoryStructure;
  components: ProjectComponent[];
  entryPoints: EntryPoint[];
  databaseContext: DatabaseContext;
  configurationContext: ConfigurationContext;
  gitContext: GitContext;
  scan: ScanMetadata;
  fingerprint: RepositoryFingerprint;
}

export interface RepositoryIdentity {
  root: string;
  normalizedPath: string;
  repositoryName: string;
  fileCount: number;
  directoryCount: number;
}

export interface DetectedTechnology {
  category: string; // "language" | "framework" | "orm" | "database" | "build" | "test" | "ci"
  name: string;
  version?: string;
  confidence: number; // 0.0 - 1.0
  evidence: string[];
}

export interface RepositoryStructure {
  root: DirectoryNode;
  classification: RepositoryClassification;
  hasWorkspaces: boolean;
  workspaceType?: "pnpm" | "npm" | "yarn" | "turbo" | "nx";
}

export interface DirectoryNode {
  path: string;
  name: string;
  type: "directory";
  category?: string; // "app" | "service" | "package" | "library" | "config" | "test"
  children: (DirectoryNode | FileNode)[];
  isSourceDirectory: boolean;
}

export interface FileNode {
  path: string;
  name: string;
  type: "file";
  extension: string;
  size: number;
  category?: string;
}

export interface ProjectComponent {
  id: string; // "apps/web", "packages/ui", "services/auth"
  type: string; // "frontend" | "backend" | "library" | "worker" | "cli" | "plugin"
  path: string;
  name?: string;
  technologies: string[];
  entryPoints: EntryPoint[];
  dependencies: string[]; // Component IDs
  files: string[]; // Relative paths
  confidence: number;
  hasPackageJson: boolean;
  buildScript?: string;
  testScript?: string;
}

export interface EntryPoint {
  type: string; // "server" | "app" | "worker" | "cli" | "index" | "main"
  path: string;
  technology?: string;
  confidence: number;
}

export interface DatabaseContext {
  detected: boolean;
  orms: DetectedTechnology[];
  migrationsPath?: string;
  schemaFiles: string[];
  seedFiles: string[];
  configurationFiles: string[];
}

export interface ConfigurationContext {
  environmentFiles: string[];
  configurationFiles: string[];
  secretsIdentified: string[]; // Keys, not values
}

export interface GitContext {
  isRepository: boolean;
  branch?: string;
  dirty: boolean;
  changedFilesCount?: number;
  remotePresent: boolean;
}

export interface ScanMetadata {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  version: string;
  filesScanned: number;
  filesSkipped: number;
  bytesScanned: number;
  errors: string[];
}

export interface RepositoryFingerprint {
  version: string;
  timestamp: string;
  fileCount: number;
  directoryCount: number;
  hash: string;
  languages: string[];
  frameworks: string[];
}

export type RepositoryClassification =
  | "monorepo"
  | "polyrepo"
  | "single-app"
  | "library"
  | "plugin"
  | "unknown";

// ============================================================================
// PHASE 1 SCANNER
// ============================================================================

export class Phase1Scanner {
  private repositoryRoot: string;
  private fileHashes: Map<string, string> = new Map();
  private visitedPaths: Set<string> = new Set();
  private startTime = 0;
  private statistics = {
    filesScanned: 0,
    filesSkipped: 0,
    bytesScanned: 0,
    errors: [] as string[],
  };

  constructor(repositoryRoot: string) {
    this.repositoryRoot = repositoryRoot;
  }

  /**
   * Run the complete Phase 1 scan
   */
  async scan(): Promise<ProjectContextLayer> {
    this.startTime = Date.now();

    try {
      // Step 1: Fast file mapping with categorization
      const fileTree = await this.mapFiles();
      const { fileCount, directoryCount } = this.countNodes(fileTree);

      // Step 2: Parallel technology detection
      const [technologies, structure, components, entryPoints] =
        await Promise.all([
          this.detectTechnologies(fileTree),
          this.buildStructure(fileTree),
          this.detectComponents(fileTree),
          this.detectEntryPoints(fileTree),
        ]);

      // Step 3: Database and configuration analysis
      const [databaseContext, configurationContext] = await Promise.all([
        this.analyzeDatabaseContext(fileTree),
        this.analyzeConfigurationContext(fileTree),
      ]);

      // Step 4: Git context (fast, non-blocking)
      const gitContext = await this.getGitContext();

      // Step 5: Generate fingerprint for change detection
      const fingerprint = await this.generateFingerprint();

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - this.startTime;

      return {
        repositoryIdentity: {
          root: this.repositoryRoot,
          normalizedPath: path.normalize(this.repositoryRoot),
          repositoryName: path.basename(this.repositoryRoot),
          fileCount,
          directoryCount,
        },
        technologies,
        structure,
        components,
        entryPoints,
        databaseContext,
        configurationContext,
        gitContext,
        scan: {
          startedAt: new Date(this.startTime).toISOString(),
          completedAt,
          durationMs,
          version: "1",
          filesScanned: this.statistics.filesScanned,
          filesSkipped: this.statistics.filesSkipped,
          bytesScanned: this.statistics.bytesScanned,
          errors: this.statistics.errors,
        },
        fingerprint,
      };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.statistics.errors.push(err);
      throw new Error(`Phase 1 scan failed: ${err}`);
    }
  }

  /**
   * Map all files with categorization (single traversal)
   */
  private async mapFiles(): Promise<DirectoryNode> {
    const root: DirectoryNode = {
      path: this.repositoryRoot,
      name: path.basename(this.repositoryRoot),
      type: "directory",
      children: [],
      isSourceDirectory: true,
    };

    await this.traverseDirectory(root, this.repositoryRoot, 0);
    return root;
  }

  /**
   * Recursive directory traversal with filtering
   */
  private async traverseDirectory(
    parentNode: DirectoryNode,
    dirPath: string,
    depth: number,
  ): Promise<void> {
    // Prevent infinite loops on symlinks/circular refs
    if (this.visitedPaths.has(dirPath)) return;
    this.visitedPaths.add(dirPath);

    // Reasonable depth limit for monorepos
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.repositoryRoot, fullPath);

        // Skip ignored directories
        if (this.shouldIgnore(entry.name, fullPath)) {
          this.statistics.filesSkipped++;
          continue;
        }

        if (entry.isDirectory()) {
          const subNode: DirectoryNode = {
            path: fullPath,
            name: entry.name,
            type: "directory",
            children: [],
            isSourceDirectory: this.isSourceDirectory(entry.name),
          };

          parentNode.children.push(subNode);
          await this.traverseDirectory(subNode, fullPath, depth + 1);
        } else {
          const stat = await fs.stat(fullPath);
          const fileNode: FileNode = {
            path: fullPath,
            name: entry.name,
            type: "file",
            extension: path.extname(entry.name).toLowerCase(),
            size: stat.size,
          };

          parentNode.children.push(fileNode);
          this.statistics.filesScanned++;
          this.statistics.bytesScanned += stat.size;

          // Hash for fingerprinting
          if (stat.size < 10 * 1024 * 1024) {
            // Only hash files < 10MB
            try {
              const content = await fs.readFile(fullPath);
              const hash = createHash("sha256").update(content).digest("hex");
              this.fileHashes.set(relativePath, hash);
            } catch {
              // Silent fail on unreadable files
            }
          }
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.statistics.errors.push(`Cannot read ${dirPath}: ${err}`);
    }
  }

  /**
   * Determine if directory should be ignored
   */
  private shouldIgnore(name: string, fullPath: string): boolean {
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
      "__.pycache__",
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
   * Determine if directory contains source code
   */
  private isSourceDirectory(dirName: string): boolean {
    const sourcePatterns = ["src", "lib", "app", "apps", "packages", "services"];
    return sourcePatterns.includes(dirName);
  }

  /**
   * Count files and directories
   */
  private countNodes(node: DirectoryNode | FileNode): {
    fileCount: number;
    directoryCount: number;
  } {
    if (node.type === "file") {
      return { fileCount: 1, directoryCount: 0 };
    }

    let fileCount = 0;
    let directoryCount = 1;

    for (const child of node.children) {
      const counts = this.countNodes(child);
      fileCount += counts.fileCount;
      directoryCount += counts.directoryCount;
    }

    return { fileCount, directoryCount };
  }

  /**
   * Detect technologies (languages, frameworks, tools)
   */
  private async detectTechnologies(
    fileTree: DirectoryNode,
  ): Promise<DetectedTechnology[]> {
    const technologies: Map<string, DetectedTechnology> = new Map();
    const fileMap = this.buildFileMap(fileTree);

    // Language detection
    const languages = await this.detectLanguages(fileTree, fileMap);
    languages.forEach((t) => technologies.set(t.name, t));

    // Framework detection
    const frameworks = await this.detectFrameworks(fileMap);
    frameworks.forEach((t) => technologies.set(t.name, t));

    // Build system detection
    const buildSystems = await this.detectBuildSystems(fileMap);
    buildSystems.forEach((t) => technologies.set(t.name, t));

    // Test framework detection
    const testFrameworks = await this.detectTestFrameworks(fileMap);
    testFrameworks.forEach((t) => technologies.set(t.name, t));

    // Database technology detection
    const databases = await this.detectDatabases(fileMap);
    databases.forEach((t) => technologies.set(t.name, t));

    return Array.from(technologies.values());
  }

  /**
   * Detect programming languages
   */
  private async detectLanguages(
    fileTree: DirectoryNode,
    fileMap: Map<string, FileNode>,
  ): Promise<DetectedTechnology[]> {
    const languages: DetectedTechnology[] = [];

    // TypeScript - check for tsconfig.json in root
    const hasTsConfig = Array.from(fileMap.keys()).some(key => key.endsWith("tsconfig.json"));
    if (hasTsConfig) {
      languages.push({
        category: "language",
        name: "TypeScript",
        version: await this.extractVersionFromFile("tsconfig.json"),
        confidence: 0.95,
        evidence: ["tsconfig.json"],
      });
    }

    // JavaScript (inferred from package.json or js files)
    const hasPackageJson = Array.from(fileMap.keys()).some(key => key.endsWith("package.json"));
    if (hasPackageJson) {
      languages.push({
        category: "language",
        name: "JavaScript",
        confidence: 0.9,
        evidence: ["package.json"],
      });
    }

    // Python
    const hasPythonFiles = Array.from(fileMap.keys()).some(key => 
      key.endsWith("pyproject.toml") || key.endsWith("setup.py")
    );
    if (hasPythonFiles) {
      languages.push({
        category: "language",
        name: "Python",
        confidence: 0.95,
        evidence: fileMap.has("pyproject.toml")
          ? ["pyproject.toml"]
          : ["setup.py"],
      });
    }

    // Go
    const hasGoMod = Array.from(fileMap.keys()).some(key => key.endsWith("go.mod"));
    if (hasGoMod) {
      languages.push({
        category: "language",
        name: "Go",
        confidence: 0.95,
        evidence: ["go.mod"],
      });
    }

    // Rust
    const hasCargoToml = Array.from(fileMap.keys()).some(key => key.endsWith("Cargo.toml"));
    if (hasCargoToml) {
      languages.push({
        category: "language",
        name: "Rust",
        confidence: 0.95,
        evidence: ["Cargo.toml"],
      });
    }

    // Java
    const hasPomXml = Array.from(fileMap.keys()).some(key => key.endsWith("pom.xml"));
    const hasBuildGradle = Array.from(fileMap.keys()).some(key => key.endsWith("build.gradle"));
    if (hasPomXml || hasBuildGradle) {
      languages.push({
        category: "language",
        name: "Java",
        confidence: 0.9,
        evidence: hasPomXml ? ["pom.xml"] : ["build.gradle"],
      });
    }

    return languages;
  }

  /**
   * Detect frameworks
   */
  private async detectFrameworks(
    fileMap: Map<string, FileNode>,
  ): Promise<DetectedTechnology[]> {
    const frameworks: DetectedTechnology[] = [];
    const pkgContent = await this.readJsonFile("package.json");

    if (pkgContent) {
      const deps = {
        ...pkgContent.dependencies,
        ...pkgContent.devDependencies,
      };

      // Frontend frameworks
      if (deps.react) {
        frameworks.push({
          category: "framework",
          name: "React",
          version: deps.react,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      if (deps.vue) {
        frameworks.push({
          category: "framework",
          name: "Vue",
          version: deps.vue,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      if (deps.next) {
        frameworks.push({
          category: "framework",
          name: "Next.js",
          version: deps.next,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      if (deps.nuxt) {
        frameworks.push({
          category: "framework",
          name: "Nuxt",
          version: deps.nuxt,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      // Backend frameworks
      if (deps.express) {
        frameworks.push({
          category: "framework",
          name: "Express",
          version: deps.express,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      if (deps.fastify) {
        frameworks.push({
          category: "framework",
          name: "Fastify",
          version: deps.fastify,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      if (deps.koa) {
        frameworks.push({
          category: "framework",
          name: "Koa",
          version: deps.koa,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      if (deps.hapi) {
        frameworks.push({
          category: "framework",
          name: "Hapi",
          version: deps.hapi,
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }

      if (deps.nestjs || deps["@nestjs/core"]) {
        frameworks.push({
          category: "framework",
          name: "NestJS",
          version: deps["@nestjs/core"],
          confidence: 0.95,
          evidence: ["package.json"],
        });
      }
    }

    return frameworks;
  }

  /**
   * Detect build systems
   */
  private async detectBuildSystems(
    fileMap: Map<string, FileNode>,
  ): Promise<DetectedTechnology[]> {
    const buildSystems: DetectedTechnology[] = [];

    const detections = [
      {
        name: "Webpack",
        files: ["webpack.config.js", "webpack.config.ts"],
      },
      { name: "Vite", files: ["vite.config.js", "vite.config.ts"] },
      { name: "Turbo", files: ["turbo.json"] },
      { name: "Nx", files: ["nx.json"] },
      { name: "Make", files: ["Makefile"] },
      { name: "Gradle", files: ["build.gradle"] },
      { name: "Maven", files: ["pom.xml"] },
      { name: "Cargo", files: ["Cargo.toml"] },
    ];

    for (const detection of detections) {
      for (const file of detection.files) {
        if (fileMap.has(file)) {
          buildSystems.push({
            category: "build",
            name: detection.name,
            confidence: 0.9,
            evidence: [file],
          });
          break;
        }
      }
    }

    return buildSystems;
  }

  /**
   * Detect test frameworks
   */
  private async detectTestFrameworks(
    fileMap: Map<string, FileNode>,
  ): Promise<DetectedTechnology[]> {
    const testFrameworks: DetectedTechnology[] = [];
    const pkgContent = await this.readJsonFile("package.json");

    if (pkgContent) {
      const deps = {
        ...pkgContent.dependencies,
        ...pkgContent.devDependencies,
      };

      const detections = [
        { pkg: "jest", name: "Jest" },
        { pkg: "mocha", name: "Mocha" },
        { pkg: "vitest", name: "Vitest" },
        { pkg: "ava", name: "AVA" },
        { pkg: "jasmine", name: "Jasmine" },
        { pkg: "tape", name: "Tape" },
      ];

      for (const detection of detections) {
        if (deps[detection.pkg]) {
          testFrameworks.push({
            category: "test",
            name: detection.name,
            version: deps[detection.pkg],
            confidence: 0.95,
            evidence: ["package.json"],
          });
        }
      }
    }

    return testFrameworks;
  }

  /**
   * Detect database technologies
   */
  private async detectDatabases(
    fileMap: Map<string, FileNode>,
  ): Promise<DetectedTechnology[]> {
    const databases: DetectedTechnology[] = [];
    const pkgContent = await this.readJsonFile("package.json");

    if (pkgContent) {
      const deps = {
        ...pkgContent.dependencies,
        ...pkgContent.devDependencies,
      };

      const detections = [
        { pkg: "pg", name: "PostgreSQL" },
        { pkg: "mysql2", name: "MySQL" },
        { pkg: "sqlite3", name: "SQLite" },
        { pkg: "mongodb", name: "MongoDB" },
        { pkg: "redis", name: "Redis" },
        { pkg: "drizzle-orm", name: "Drizzle ORM" },
        { pkg: "prisma", name: "Prisma" },
        { pkg: "typeorm", name: "TypeORM" },
        { pkg: "sequelize", name: "Sequelize" },
      ];

      for (const detection of detections) {
        if (deps[detection.pkg]) {
          databases.push({
            category: "database",
            name: detection.name,
            version: deps[detection.pkg],
            confidence: 0.95,
            evidence: ["package.json"],
          });
        }
      }
    }

    return databases;
  }

  /**
   * Build directory structure
   */
  private async buildStructure(
    fileTree: DirectoryNode,
  ): Promise<RepositoryStructure> {
    const classification = this.classifyRepository(fileTree);
    const hasWorkspaces = await this.detectWorkspaces(fileTree);

    return {
      root: fileTree,
      classification,
      hasWorkspaces,
      workspaceType: hasWorkspaces ? await this.detectWorkspaceType() : undefined,
    };
  }

  /**
   * Classify repository type
   */
  private classifyRepository(fileTree: DirectoryNode): RepositoryClassification {
    let appsCount = 0;
    let packagesCount = 0;
    let servicesCount = 0;

    for (const child of fileTree.children) {
      if (child.type === "directory") {
        if (child.name === "apps") appsCount++;
        if (child.name === "packages") packagesCount++;
        if (child.name === "services") servicesCount++;
      }
    }

    if (appsCount > 0 || packagesCount > 0 || servicesCount > 0) {
      return "monorepo";
    }

    if (packagesCount === 0 && appsCount === 0) {
      return "single-app";
    }

    return "unknown";
  }

  /**
   * Detect workspace configuration
   */
  private async detectWorkspaces(fileTree: DirectoryNode): Promise<boolean> {
    const fileMap = this.buildFileMap(fileTree);

    // Check for workspace configs
    if (fileMap.has("pnpm-workspace.yaml")) return true;
    if (fileMap.has("turbo.json")) return true;
    if (fileMap.has("nx.json")) return true;

    // Check for package.json workspaces
    const pkgContent = await this.readJsonFile("package.json");
    if (pkgContent?.workspaces) return true;

    return false;
  }

  /**
   * Detect workspace type
   */
  private async detectWorkspaceType(): Promise<
    "pnpm" | "npm" | "yarn" | "turbo" | "nx" | undefined
  > {
    const fileMap = this.buildFileMap(await this.mapFiles());

    if (fileMap.has("pnpm-workspace.yaml")) return "pnpm";
    if (fileMap.has("turbo.json")) return "turbo";
    if (fileMap.has("nx.json")) return "nx";

    const pkgContent = await this.readJsonFile("package.json");
    if (pkgContent?.workspaces) {
      return "npm"; // or yarn, but npm/yarn share format
    }

    return undefined;
  }

  /**
   * Detect components (apps/services/packages/libraries)
   */
  private async detectComponents(
    fileTree: DirectoryNode,
  ): Promise<ProjectComponent[]> {
    const components: ProjectComponent[] = [];
    const fileMap = this.buildFileMap(fileTree);

    // Common component directories
    const componentDirs = ["apps", "services", "packages"];

    for (const child of fileTree.children) {
      if (child.type === "directory" && componentDirs.includes(child.name)) {
        // Each subdirectory is a component
        for (const subchild of child.children) {
          if (subchild.type === "directory") {
            const componentPath = path.relative(this.repositoryRoot, subchild.path);
            const component = await this.analyzeComponent(
              subchild,
              componentPath,
            );
            if (component) {
              components.push(component);
            }
          }
        }
      }
    }

    return components;
  }

  /**
   * Analyze individual component
   */
  private async analyzeComponent(
    node: DirectoryNode,
    componentPath: string,
  ): Promise<ProjectComponent | null> {
    const componentMap = this.buildFileMap(node);
    const hasPackageJson = componentMap.has("package.json");

    if (!hasPackageJson) {
      return null;
    }

    const pkgContent = await this.readJsonFileAtPath(
      path.join(node.path, "package.json"),
    );

    if (!pkgContent) {
      return null;
    }

    // Determine component type
    let componentType = "library";
    if (pkgContent.type === "frontend" || componentMap.has("src/App.tsx")) {
      componentType = "frontend";
    } else if (pkgContent.type === "backend" || componentMap.has("src/server.ts")) {
      componentType = "backend";
    }

    const files = this.collectFilePaths(node);

    return {
      id: componentPath,
      type: componentType,
      path: componentPath,
      name: node.name,
      technologies: this.extractTechnologies(pkgContent),
      entryPoints: [],
      dependencies: Object.keys(pkgContent.dependencies || {}),
      files,
      confidence: 0.9,
      hasPackageJson: true,
      buildScript: pkgContent.scripts?.build,
      testScript: pkgContent.scripts?.test,
    };
  }

  /**
   * Detect entry points
   */
  private async detectEntryPoints(
    fileTree: DirectoryNode,
  ): Promise<EntryPoint[]> {
    const entryPoints: EntryPoint[] = [];
    const commonEntryFiles = [
      "index.ts",
      "index.js",
      "main.ts",
      "main.js",
      "app.ts",
      "app.js",
      "server.ts",
      "server.js",
      "cli.ts",
      "cli.js",
      "index.tsx",
      "index.jsx",
      "App.tsx",
    ];

    const findEntryPoints = (node: DirectoryNode | FileNode) => {
      if (node.type === "file") {
        const commonEntry = commonEntryFiles.find(
          (f) => node.name.toLowerCase() === f.toLowerCase(),
        );
        if (commonEntry) {
          const relativePath = path.relative(this.repositoryRoot, node.path);
          const type = this.inferEntryPointType(commonEntry);
          entryPoints.push({
            type,
            path: relativePath,
            confidence: 0.85,
          });
        }
      } else if (node.type === "directory") {
        for (const child of node.children) {
          findEntryPoints(child);
        }
      }
    };

    findEntryPoints(fileTree);
    return entryPoints;
  }

  /**
   * Infer entry point type from filename
   */
  private inferEntryPointType(
    filename: string,
  ): "server" | "app" | "worker" | "cli" | "index" | "main" {
    const lower = filename.toLowerCase();
    if (lower.includes("server")) return "server";
    if (lower.includes("cli")) return "cli";
    if (lower.includes("worker")) return "worker";
    if (lower.includes("app")) return "app";
    if (lower.includes("main")) return "main";
    return "index";
  }

  /**
   * Analyze database context
   */
  private async analyzeDatabaseContext(
    fileTree: DirectoryNode,
  ): Promise<DatabaseContext> {
    const fileMap = this.buildFileMap(fileTree);
    const pkgContent = await this.readJsonFile("package.json");

    const orms: DetectedTechnology[] = [];
    const deps = {
      ...pkgContent?.dependencies,
      ...pkgContent?.devDependencies,
    };

    if (deps.drizzle) {
      orms.push({
        category: "orm",
        name: "Drizzle",
        version: deps.drizzle,
        confidence: 0.95,
        evidence: ["package.json"],
      });
    }

    if (deps.prisma) {
      orms.push({
        category: "orm",
        name: "Prisma",
        version: deps.prisma,
        confidence: 0.95,
        evidence: ["package.json"],
      });
    }

    // Find migration/schema files
    const migrationsPath = this.findPath("migrations", fileTree);
    const schemaFiles = this.findFilesByPattern(
      fileTree,
      /\.sql$|schema\.(ts|js|json)$/,
    );
    const seedFiles = this.findFilesByPattern(fileTree, /seed\.(ts|js)$/);

    return {
      detected: orms.length > 0 || schemaFiles.length > 0,
      orms,
      migrationsPath,
      schemaFiles,
      seedFiles,
      configurationFiles: [],
    };
  }

  /**
   * Analyze configuration context
   */
  private async analyzeConfigurationContext(
    fileTree: DirectoryNode,
  ): Promise<ConfigurationContext> {
    const fileMap = this.buildFileMap(fileTree);
    const environmentFiles: string[] = [];
    const configurationFiles: string[] = [];
    const secretsIdentified: string[] = [];

    // Environment files
    if (fileMap.has(".env")) environmentFiles.push(".env");
    if (fileMap.has(".env.local")) environmentFiles.push(".env.local");
    if (fileMap.has(".env.example")) environmentFiles.push(".env.example");

    // Configuration files
    if (fileMap.has(".eslintrc")) configurationFiles.push(".eslintrc");
    if (fileMap.has(".prettierrc")) configurationFiles.push(".prettierrc");
    if (fileMap.has("babel.config.js"))
      configurationFiles.push("babel.config.js");
    if (fileMap.has("tsconfig.json")) configurationFiles.push("tsconfig.json");
    if (fileMap.has("tailwind.config.js"))
      configurationFiles.push("tailwind.config.js");

    // Common secret keys (NOT values)
    const secretKeys = [
      "DATABASE_URL",
      "OPENAI_API_KEY",
      "STRIPE_SECRET_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "GITHUB_TOKEN",
      "JWT_SECRET",
    ];

    return {
      environmentFiles,
      configurationFiles,
      secretsIdentified: secretKeys, // Static list, never actual values
    };
  }

  /**
   * Get git context
   */
  private async getGitContext(): Promise<GitContext> {
    try {
      const { stdout: branch } = await execFileAsync("git", [
        "branch",
        "--show-current",
      ]);

      const { stdout: statusOutput } = await execFileAsync("git", [
        "status",
        "--short",
      ]);

      const changedFilesCount = statusOutput
        .split("\n")
        .filter((line) => line.trim()).length;

      const remoteCheck = await execFileAsync("git", ["remote", "-v"])
        .then(() => true)
        .catch(() => false);

      return {
        isRepository: true,
        branch: branch.trim(),
        dirty: changedFilesCount > 0,
        changedFilesCount,
        remotePresent: remoteCheck,
      };
    } catch {
      return {
        isRepository: false,
        dirty: false,
        remotePresent: false,
      };
    }
  }

  /**
   * Generate repository fingerprint for change detection
   */
  private async generateFingerprint(): Promise<RepositoryFingerprint> {
    // Hash all file hashes together
    const allHashes = Array.from(this.fileHashes.values()).sort().join("");
    const repositoryHash = createHash("sha256").update(allHashes).digest("hex");

    // Extract technologies
    const fileMap = this.buildFileMap(await this.mapFiles());
    const pkgContent = await this.readJsonFile("package.json");

    const languages: string[] = [];
    const frameworks: string[] = [];

    if (fileMap.has("tsconfig.json")) languages.push("TypeScript");
    if (fileMap.has("package.json")) languages.push("JavaScript");
    if (fileMap.has("pyproject.toml")) languages.push("Python");
    if (fileMap.has("go.mod")) languages.push("Go");
    if (fileMap.has("Cargo.toml")) languages.push("Rust");

    if (pkgContent) {
      const deps = {
        ...pkgContent.dependencies,
        ...pkgContent.devDependencies,
      };
      if (deps.react) frameworks.push("React");
      if (deps.next) frameworks.push("Next.js");
      if (deps.express) frameworks.push("Express");
      if (deps.fastify) frameworks.push("Fastify");
    }

    return {
      version: "1",
      timestamp: new Date().toISOString(),
      fileCount: this.statistics.filesScanned,
      directoryCount: 0, // Will be populated from tree
      hash: repositoryHash,
      languages,
      frameworks,
    };
  }

  /**
   * Helper: Build file map for quick lookups
   */
  private buildFileMap(node: DirectoryNode | FileNode): Map<string, FileNode> {
    const map = new Map<string, FileNode>();

    const traverse = (n: DirectoryNode | FileNode, prefix = "") => {
      if (n.type === "file") {
        map.set(prefix + n.name, n);
      } else {
        for (const child of n.children) {
          traverse(child, prefix + n.name + "/");
        }
      }
    };

    traverse(node);
    return map;
  }

  /**
   * Helper: Extract technologies from package.json
   */
  private extractTechnologies(pkg: any): string[] {
    const tech: string[] = [];
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.react) tech.push("React");
    if (deps.vue) tech.push("Vue");
    if (deps.next) tech.push("Next.js");
    if (deps.express) tech.push("Express");
    if (deps.fastify) tech.push("Fastify");
    if (deps.typeorm) tech.push("TypeORM");
    if (deps.prisma) tech.push("Prisma");

    return tech;
  }

  /**
   * Helper: Collect file paths
   */
  private collectFilePaths(
    node: DirectoryNode,
    prefix = "",
  ): string[] {
    const files: string[] = [];

    for (const child of node.children) {
      const childPath = prefix + "/" + child.name;
      if (child.type === "file") {
        files.push(childPath);
      } else {
        files.push(...this.collectFilePaths(child, childPath));
      }
    }

    return files;
  }

  /**
   * Helper: Find path by directory name
   */
  private findPath(
    dirName: string,
    node: DirectoryNode | FileNode,
  ): string | undefined {
    if (node.type === "directory") {
      if (node.name === dirName) {
        return path.relative(this.repositoryRoot, node.path);
      }
      for (const child of node.children) {
        const result = this.findPath(dirName, child);
        if (result) return result;
      }
    }
    return undefined;
  }

  /**
   * Helper: Find files by pattern
   */
  private findFilesByPattern(
    node: DirectoryNode | FileNode,
    pattern: RegExp,
  ): string[] {
    const files: string[] = [];

    const traverse = (n: DirectoryNode | FileNode) => {
      if (n.type === "file" && pattern.test(n.name)) {
        files.push(path.relative(this.repositoryRoot, n.path));
      } else if (n.type === "directory") {
        for (const child of n.children) {
          traverse(child);
        }
      }
    };

    traverse(node);
    return files;
  }

  /**
   * Helper: Read JSON file at specific path
   */
  private async readJsonFileAtPath(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Helper: Read JSON file from repository root
   */
  private async readJsonFile(filename: string): Promise<any> {
    return this.readJsonFileAtPath(path.join(this.repositoryRoot, filename));
  }

  /**
   * Helper: Extract version from config files
   */
  private async extractVersionFromFile(filename: string): Promise<
    string | undefined
  > {
    const content = await this.readJsonFile(filename);
    return content?.compilerOptions?.version || undefined;
  }
}
