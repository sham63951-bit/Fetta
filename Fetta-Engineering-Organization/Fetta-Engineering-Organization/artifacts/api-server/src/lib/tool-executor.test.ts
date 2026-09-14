import { validatePath } from "./tool-executor.js";
import path from "path";
import { fileURLToPath } from "url";

// Simple test runner
let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      console.log(`✓ ${name}`);
      passed++;
    } else {
      console.log(`✗ ${name}`);
      failed++;
    }
  } catch (error) {
    console.log(`✗ ${name} - ${error instanceof Error ? error.message : "Unknown error"}`);
    failed++;
  }
}

// Use a realistic Windows-style path for testing
const repoRoot = "C:\\projects\\fetta";

console.log("\n=== Valid paths (should return true) ===\n");

test("should allow the repository root itself", () => {
  return validatePath(repoRoot, ".") === true && validatePath(repoRoot, "") === true;
});

test("should allow normal nested file", () => {
  return validatePath(repoRoot, "src/index.ts") === true && 
         validatePath(repoRoot, "lib/utils/helper.ts") === true;
});

test("should allow deeply nested paths", () => {
  return validatePath(repoRoot, "src/components/ui/button.tsx") === true;
});

test("should allow paths with leading ./", () => {
  return validatePath(repoRoot, "./src/index.ts") === true;
});

console.log("\n=== Invalid paths (should return false) ===\n");

test("should reject sibling directory with matching prefix", () => {
  // This is the key security test: C:\\projects\\fetta-evil looks like it starts with C:\\projects\\fetta
  // but is actually a sibling directory
  return validatePath(repoRoot, "../fetta-evil/malicious.ts") === false;
});

test("should reject parent directory traversal with ../", () => {
  return validatePath(repoRoot, "../outside.txt") === false &&
         validatePath(repoRoot, "../../outside.txt") === false &&
         validatePath(repoRoot, "../../../etc/passwd") === false;
});

test("should reject traversal through subdirectory", () => {
  return validatePath(repoRoot, "src/../../outside.txt") === false &&
         validatePath(repoRoot, "src/../../../outside.txt") === false;
});

test("should reject absolute paths outside repository", () => {
  return validatePath(repoRoot, "C:\\windows\\system32\\evil.dll") === false &&
         validatePath(repoRoot, "C:\\projects\\other-repo\\file.ts") === false &&
         validatePath(repoRoot, "/etc/passwd") === false;
});

test("should reject paths that go up and then down to sibling", () => {
  return validatePath(repoRoot, "../fetta-sibling/file.ts") === false;
});

console.log("\n=== Edge cases ===\n");

test("should handle trailing slashes correctly", () => {
  const repoWithSlash = "C:\\projects\\fetta\\";
  return validatePath(repoWithSlash, "src/index.ts") === true &&
         validatePath(repoWithSlash, "../outside.txt") === false;
});

test("should handle mixed path separators on Windows", () => {
  return validatePath(repoRoot, "src/lib/utils.ts") === true &&
         validatePath(repoRoot, "src\\lib\\utils.ts") === true;
});

test("should handle complex relative navigation that stays inside", () => {
  // src/../lib/utils.ts resolves to lib/utils.ts which is inside
  return validatePath(repoRoot, "src/../lib/utils.ts") === true &&
         validatePath(repoRoot, "src/components/../../lib/utils.ts") === true;
});

console.log("\n=== Real-world attack scenarios ===\n");

test("should prevent the sibling-prefix attack", () => {
  // Attacker tries to write to C:\\projects\\fetta-data by exploiting prefix matching
  const siblingPath = path.join(path.dirname(repoRoot), "fetta-data", "secrets.txt");
  const relativeSibling = path.relative(repoRoot, siblingPath);
  return validatePath(repoRoot, relativeSibling) === false;
});

test("should prevent directory traversal to parent", () => {
  // Attacker tries to write to parent directory
  const parentPath = path.join(path.dirname(repoRoot), "secrets.env");
  const relativeParent = path.relative(repoRoot, parentPath);
  return validatePath(repoRoot, relativeParent) === false;
});

test("should prevent absolute path injection", () => {
  // Attacker provides absolute path directly
  return validatePath(repoRoot, "C:\\Users\\admin\\secrets.txt") === false &&
         validatePath(repoRoot, "\\\\network\\share\\data.txt") === false;
});

console.log(`\n=== Results ===\n`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

process.exit(failed > 0 ? 1 : 0);

