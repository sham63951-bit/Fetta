# Phase 1 Architecture Assessment

## Executive Summary

Fetta currently has a **minimal repository scanner** that detects only language, framework, package manager, and Git status. Phase 1 requires a comprehensive **Project Context Layer** that builds deep deterministic understanding of repository structure, technology stack, entry points, dependencies, and configuration—**without requiring an LLM**.

**Core Constraint**: Zero LLM calls. Zero agent invocation. Pure deterministic scanning.

---

## CURRENT PHASE 1 CAPABILITIES

### What Currently Works

| Capability | Status | Implementation |
|-----------|--------|-----------------|
| **Language Detection** | ✅ Limited | Checks: tsconfig.json, pyproject.toml, Cargo.toml, go.mod, package.json |
| **Framework Detection** | ✅ Limited | Parses package.json for: next, vite, express, fastify, react |
| **Package Manager Detection** | ✅ Working | Checks: pnpm-lock.yaml, yarn.lock, package-lock.json, requirements.txt |
| **Git Status** | ✅ Working | Branch, changed files count, diff (when available) |
| **File Listing** | ✅ Working | Recursive traversal, 3-level depth, ignores node_modules/.git/dist |
| **Path Security** | ✅ Robust | validatePath() uses path.relative() boundary checking |
| **Database Persistence** | ✅ Working | Projects table, memoriesTable, eventsTable available |
| **Repository Boundary** | ✅ Enforced | All file access validated, no escape possible |

### What Works but Needs Extension

| Capability | Status | Gap |
|-----------|--------|-----|
| **File Metadata** | ⚠️ Partial | Only path, type, size; needs language/purpose/role |
| **Package.json Analysis** | ⚠️ Partial | Only checks specific packages; misses version info, scripts |
| **Project Structure** | ⚠️ Minimal | No classification of apps/services/packages |
| **Memory System** | ⚠️ Underused | Exists but only stores facts after agents run |
| **Context Message** | ⚠️ Limited | Simple text; agents receive only raw file content |

---

## MISSING CAPABILITIES

### Critical Gaps

1. **Technology Version Detection**
   - Current: "uses TypeScript"
   - Needed: "uses TypeScript 5.2.1 (from tsconfig.json)"
   
2. **Build System Detection**
   - Current: None
   - Needed: npm/pnpm/yarn/Make/Gradle/Maven/Cargo detection

3. **Test Framework Detection**
   - Current: None
   - Needed: Jest/Mocha/pytest/Vitest/Go test detection

4. **Project Structure Analysis**
   - Current: None
   - Needed: Classify directories as apps/services/packages/libraries

5. **Fingerprinting & Change Detection**
   - Current: None
   - Needed: Hash repository state for incremental scanning

6. **Entry Point Detection**
   - Current: None
   - Needed: Find main, index, server, app, entry points for each component

7. **Configuration File Analysis**
   - Current: Only git, only package.json for deps
   - Needed: tsconfig.json, .eslintrc, babel.config, webpack.config, vite.config, etc.

8. **Import/Dependency Graph**
   - Current: None
   - Needed: At least top-level "module A imports module B" for detection

9. **Application Classification**
   - Current: None
   - Needed: "backend API", "frontend SPA", "worker", "library", "CLI tool"

10. **Database Intelligence**
    - Current: None
    - Needed: ORM detection, migration dirs, schema files identification

---

## REUSABLE COMPONENTS

### Core Code to Build Upon

```typescript
// 1. listFiles() - Already handles traversal and filtering
// Location: repository-context.ts:21-67
// REUSE: Extend with file categorization, language detection
// DO NOT: Rewrite; add configuration options

// 2. RepositoryProfile Type - Core metadata structure
// Location: repository.ts:11-17
// REUSE: Extend with new fields (versions, technologies, structure)
// DO NOT: Change existing fields; only append

// 3. validatePath() - Repository boundary protection
// Location: tool-executor.ts:50-62
// REUSE: Use for all Phase 1 file operations
// DO NOT: Modify; critical for security

// 4. FileInfo Interface - File metadata holder
// Location: repository-context.ts:11-14
// REUSE: Extend with language, imports, role
// DO NOT: Change existing fields

// 5. buildContextMessage() - Context formatting
// Location: repository-context.ts:92-116
// REUSE: Extend with more metadata
// DO NOT: Change agent-facing format incompletely

// 6. Memory System - Fact storage
// Location: memoriesTable in db schema
// REUSE: Store Phase 1 findings as "facts", "decisions", "conventions"
// DO NOT: Bypass; keeps audit trail

// 7. Database Layer - ORM in place
// Location: lib/db/ and schema/index.ts
// REUSE: Extend schema with Phase 1 scan metadata if needed
// DO NOT: Change Drizzle queries; add new tables if necessary
```

### Database Schema Extension Points

```typescript
// Current projects table has:
// - id, name, repositoryPath, status, profile (JSONB), createdAt, updatedAt

// Phase 1 can extend:
// OPTION A: Add Phase 1 metadata to projects.profile JSONB
// - Avoids schema changes
// - profile becomes: {...existing, scan_metadata: {...}}

// OPTION B: Add dedicated scan table
// - Tracks multiple scans per project
// - Supports incremental scanning
// - schema: projectScansTable with scan_id, project_id, timestamp, fingerprint, metadata

// Recommendation: Use OPTION A for initial Phase 1
// Migrate to OPTION B if incremental scanning proves critical
```

### API Entry Point - POST /projects/:projectId/attach

```typescript
// Current: POST /projects creates project
// Future Phase 1: POST /projects/:projectId/attach (or POST /projects/:projectId/scan enhanced)

// Should:
// 1. Accept repositoryPath
// 2. Validate path boundary
// 3. Run deterministic scan
// 4. Update projects.profile with rich metadata
// 5. Store facts in memoriesTable
// 6. Record events in eventsTable
// 7. Return ProjectContextLayer

// Should NOT:
// - Invoke any agents
// - Make LLM calls
// - Modify the repository
// - Require external services
```

---

## ARCHITECTURAL RISKS

### Current Assumptions That Would Break Phase 1

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Assumes Node.js tooling** | Non-JS projects can't verify | Add generic verification framework |
| **Limited file depth** | Monorepos incompletely analyzed | Increase depth or make configurable |
| **No symlink handling** | Could fail on complex structures | Add symlink detection/skipping |
| **UTF-8 assumption** | Binary files fail | Add binary file detection |
| **Single scan per project** | Can't track changes | Design incremental scan support |
| **Git optional** | Non-git repos incomplete | Design non-git path gracefully |
| **Package.json centric** | Non-JS projects hard to understand | Add language-specific config detection |
| **No workspace understanding** | Monorepos confused | Detect pnpm/npm/yarn workspaces |
| **Disk I/O not optimized** | Slow on large repos | Design streaming/parallel scans |

### Breaking Changes to Avoid

- ❌ Do NOT change `RepositoryProfile` existing fields
- ❌ Do NOT change `FileInfo` existing fields
- ❌ Do NOT modify `validatePath()` logic
- ❌ Do NOT bypass `memoriesTable` for findings
- ❌ Do NOT remove existing agent context structures
- ❌ Do NOT assume LLM availability
- ❌ Do NOT require new external dependencies

---

## PROPOSED PHASE 1 IMPLEMENTATION

### Architecture Diagram

```
POST /projects/:projectId/attach
    ↓
Phase1Scanner
    ├─ PreflightCheck (path validation)
    ├─ FastFileMapping (single traversal, categorize files)
    ├─ TechnologyDetection
    │   ├─ LanguageDetector (tsconfig, package.json, etc.)
    │   ├─ FrameworkDetector (package.json + config files)
    │   ├─ BuildSystemDetector (Makefile, gradle, cargo, webpack, etc.)
    │   └─ TestFrameworkDetector (jest, pytest, vitest, etc.)
    ├─ StructureAnalyzer
    │   ├─ DirectoryClassifier (apps/, services/, packages/, libs/)
    │   ├─ ProjectComponentDetector (frontend/backend/worker/lib)
    │   └─ EntryPointFinder (main, index, server, app, cli)
    ├─ RepositoryStructureBuilder
    │   └─ Creates hierarchy of components/services/packages
    ├─ DatabaseIntelligence (ORM, migrations detection)
    ├─ ConfigurationAnalysis (tsconfig, .env files detection)
    ├─ GitIntelligence (branch, diff, status)
    └─ FingerprintGenerator (hash for change detection)
    ↓
ProjectContextLayer
    ├─ RepositoryIdentity
    ├─ TechnologyStack
    ├─ RepositoryStructure
    ├─ FileInventory
    ├─ ComponentTree
    ├─ EntryPoints
    ├─ Dependencies
    ├─ DatabaseContext
    ├─ ConfigurationContext
    └─ RepositoryFingerprint
    ↓
StorageLayer
    ├─ Update projects.profile
    ├─ Store facts in memoriesTable
    ├─ Record event in eventsTable
    └─ Return context to caller
```

### New Types to Add (Not Modifying Existing)

```typescript
// Phase 1 additions - extend, never replace

interface ProjectContextLayer {
  // Identity
  repositoryIdentity: RepositoryIdentity;
  
  // Technologies
  technologies: DetectedTechnology[];
  
  // Structure
  structure: RepositoryStructure;
  
  // Components
  components: ProjectComponent[];
  
  // Metadata
  scan: ScanMetadata;
  
  // Fingerprint for change detection
  fingerprint: RepositoryFingerprint;
}

interface DetectedTechnology {
  category: string;        // "language" | "framework" | "orm" | "database" | etc
  name: string;            // "TypeScript", "PostgreSQL", "Jest", etc
  version?: string;        // "5.2.1" or undefined if not detected
  confidence: number;      // 0.0 - 1.0
  evidence: string[];      // ["tsconfig.json", "package.json"]
}

interface RepositoryStructure {
  root: DirectoryNode;
  classification: RepositoryClassification;  // "monorepo" | "polyrepo" | "single-app" | etc
}

interface ProjectComponent {
  id: string;              // "apps/web", "services/auth", "packages/ui"
  type: string;            // "frontend" | "backend" | "library" | "worker" | "cli"
  path: string;
  name?: string;
  technologies: string[];
  entryPoints?: EntryPoint[];
  dependencies?: string[]; // Component IDs it depends on
  files: string[];         // Relative paths in this component
  confidence: number;
}

interface EntryPoint {
  type: string;            // "server" | "app" | "worker" | "cli" | "index"
  path: string;
  technology?: string;
  confidence: number;
}

interface RepositoryFingerprint {
  version: string;         // "1" for Phase 1
  timestamp: string;       // ISO timestamp
  fileCount: number;
  directoryCount: number;
  hash: string;            // SHA256 of combined file hashes
  languages: string[];
  frameworks: string[];
}

interface ScanMetadata {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  version: string;         // Phase 1 version identifier
  filesScanned: number;
  filesSkipped: number;
  bytesScanAnd: number;
  errors: string[];
}
```

### Implementation Strategy

#### Phase 1a: Core Infrastructure (fastest path)

1. **FileMapper** - Single optimized traversal
   - Categorize files as source/config/test/build/vendor
   - Collect extensions, sizes
   - Build flat inventory first

2. **TechnologyDetector** - Deterministic pattern matching
   - Check config files (safe, small)
   - Parse package.json versions
   - Identify frameworks from imports (limited sampling)

3. **StructureBuilder** - Directory pattern recognition
   - Classify based on names: apps/, src/, packages/, etc.
   - No recursive depth limits; parallel processing

4. **StorageAdapter** - Persist to existing schema
   - Extend projects.profile JSONB
   - Create memory entries for key findings

#### Phase 1b: Rich Features (once core works)

5. **EntryPointDetector** - Find mains and server.ts
6. **DependencyMapper** - Parse import statements (limited)
7. **DatabaseDetector** - Find migrations and schemas
8. **ConfigAnalyzer** - Parse relevant configs
9. **GitEnhancer** - Rich git metadata
10. **FingerprintGenerator** - For change detection

### Performance Targets

```
COLD SCAN (first attachment):
  Target: < 5 seconds on typical project (< 10k files)
  Budget: 
    - Filesystem traversal: 1-2s
    - Technology detection: 0.5s
    - Structure analysis: 0.5s
    - Storage/serialization: 0.5s
    - Overhead: 1.5s

WARM SCAN (no changes):
  Target: < 500ms
  Method: Compare fingerprints, skip if unchanged

INCREMENTAL SCAN (few files changed):
  Target: < 1s
  Method: Delta from fingerprint, rescan affected components only

Constraints:
  - Single filesystem pass if possible
  - Parallel independent analysis
  - No nested scans or duplicate I/O
  - Stream results where practical
```

### No LLM, No Agents Guarantee

Phase 1 must work with:

```typescript
// Environment variables NOT required:
MODEL_API_KEY        // absent
MODEL_PROVIDER       // absent
MODEL_BASE_URL       // absent
MODEL_NAME           // absent
DATABASE_URL         // still needed (ORM requirement)

// Functions NOT invoked:
createProvider()     // ❌ Never called
runCoordinator()     // ❌ Never called
runArchitect()       // ❌ Never called
runEngineer()        // ❌ Never called
runTest()            // ❌ Never called
executeCommand()     // ❌ Never called (except maybe for git, as read-only)

// Only functions used:
fs.promises.*()      // Read files
path.*()             // Path operations
crypto.*()           // Hashing
child_process (git)  // Read-only git operations
db queries           // Store results
```

---

## IMPLEMENTATION ROADMAP

### Week 1: Core Phase 1

- [x] Task 1: Audit existing code
- [x] Task 2-3: Architecture assessment
- [ ] Task 4: Technology detector
- [ ] Task 5: Structure analyzer
- [ ] Task 6: File inventory
- [ ] Task 7: Entry point detector
- [ ] Task 8: Database detector
- [ ] Task 9: Git integration
- [ ] Task 10: Context layer storage

### Week 2: Integration & Testing

- [ ] Task 11: Incremental scanning
- [ ] Task 12: Test on Fetta itself
- [ ] Task 13: Performance measurement
- [ ] Task 14: Verification (no LLM/agents)
- [ ] Task 15: Final report

---

## NEXT STEPS

1. ✅ Audit complete
2. ✅ Architecture designed
3. 📍 **NOW: Implement Phase 1 Scanner**
   - Start with FileMapper (single traversal)
   - Add TechnologyDetector (pattern-based)
   - Add StructureBuilder (directory classification)
   - Connect to storage layer
4. Test on Fetta repository
5. Measure performance
6. Verify zero LLM/agent calls
7. Report results

---

## Success Criteria

Phase 1 is **PASS** only if:

```
✓ Can attach to repository deterministically
✓ Produces rich ProjectContextLayer without LLM
✓ Scan < 5 seconds on typical project
✓ Warm scan < 500ms
✓ All results persisted and queryable
✓ No LLM calls (verifiable in logs)
✓ No agent invocations
✓ Repository remains unmodified
✓ Path security maintained
✓ Phase 2 agents can consume context cleanly
✓ Ready for production use on arbitrary repositories
```

---

END ARCHITECTURE ASSESSMENT
