#!/usr/bin/env python3
"""Phase 1 Core Functionality Tests"""

import requests
import json
import time
import sys

API_BASE = "http://localhost:8080/api"
REPO_PATH = r"C:\Users\as\Downloads\Fetta-Engineering-Organization\Fetta-Engineering-Organization"

tests_passed = 0
tests_failed = 0
tests_warning = 0

def test(name, check):
    """Run a test check"""
    global tests_passed, tests_failed
    try:
        if check():
            print(f"[PASS] {name}")
            tests_passed += 1
            return True
        else:
            print(f"[FAIL] {name}")
            tests_failed += 1
            return False
    except Exception as e:
        print(f"[FAIL] {name}: {e}")
        tests_failed += 1
        return False

def get_json(endpoint):
    """Get JSON from API endpoint"""
    resp = requests.get(f"{API_BASE}/{endpoint}")
    resp.raise_for_status()
    return resp.json()

def post_json(endpoint, body):
    """POST JSON to API endpoint"""
    resp = requests.post(f"{API_BASE}/{endpoint}", json=body)
    resp.raise_for_status()
    return resp.json()

print("\n===== PHASE 1 CORE FUNCTIONALITY TESTS =====\n")

# Load project
print("--- Loading Project ---")
proj = get_json("projects/current")
project_id = proj["id"]
print(f"Project: {project_id}")

# TEST 1: Repository Scanning
print("\n--- TEST GROUP: Repository Scanning ---")

scan = post_json(f"projects/{project_id}/phase1/attach", {"repositoryPath": REPO_PATH})
test("Phase 1 scan completed", lambda: scan["success"] and scan["scan"]["filesScanned"] > 0)

if scan["success"]:
    print(f"  Scan duration: {scan['scan']['durationMs']}ms")
    print(f"  Files scanned: {scan['scan']['filesScanned']}")
    print(f"  Bytes scanned: {scan['scan']['bytesScanned']}")

# TEST 2: Repository Identity
print("\n--- TEST GROUP: Repository Identity ---")

ctx = get_json(f"projects/{project_id}/phase1/context")

test("Repository root matches", lambda: ctx["repositoryIdentity"]["root"] == REPO_PATH)
test("File count recorded", lambda: ctx["repositoryIdentity"]["fileCount"] > 0)
test("Directory count recorded", lambda: ctx["repositoryIdentity"]["directoryCount"] > 0)

print(f"  Root: {ctx['repositoryIdentity']['root']}")
print(f"  Files: {ctx['repositoryIdentity']['fileCount']}")
print(f"  Directories: {ctx['repositoryIdentity']['directoryCount']}")

# TEST 3: Technology Detection
print("\n--- TEST GROUP: Technology Detection ---")

test("Technologies array exists", lambda: isinstance(ctx["technologies"], list))

techs = ctx["technologies"]
print(f"  Detected {len(techs)} technologies:")
for t in techs:
    print(f"    - {t['name']} ({t.get('category', 'unknown')})")

has_ts = any(t["name"] == "TypeScript" for t in techs)
has_js = any(t["name"] == "JavaScript" for t in techs)

test("TypeScript detected", lambda: has_ts)
test("JavaScript detected", lambda: has_js)

# TEST 4: Entry Points
print("\n--- TEST GROUP: Entry Point Detection ---")

test("Entry points array exists", lambda: isinstance(ctx["entryPoints"], list))
test("Entry points found", lambda: len(ctx["entryPoints"]) > 0)

eps = ctx["entryPoints"]
print(f"  Found {len(eps)} entry points:")
for ep in eps[:3]:
    print(f"    - {ep['type']}: {ep['path']}")

# TEST 5: Structure Classification
print("\n--- TEST GROUP: Repository Structure ---")

test("Structure classification exists", lambda: ctx["structure"]["classification"] is not None)
print(f"  Classification: {ctx['structure']['classification']}")
print(f"  Has workspaces: {ctx['structure']['hasWorkspaces']}")

# TEST 6: Fingerprinting
print("\n--- TEST GROUP: Fingerprinting and Determinism ---")

test("Fingerprint exists", lambda: ctx["fingerprint"]["hash"] is not None and len(ctx["fingerprint"]["hash"]) == 64)

fp1 = ctx["fingerprint"]["hash"]
print(f"  Fingerprint: {fp1[:16]}...")

# Rescan and check determinism
time.sleep(1)
scan2 = post_json(f"projects/{project_id}/phase1/attach", {"repositoryPath": REPO_PATH})
ctx2 = get_json(f"projects/{project_id}/phase1/context")
fp2 = ctx2["fingerprint"]["hash"]

test("Fingerprints match (deterministic)", lambda: fp1 == fp2)

# TEST 7: Git Context
print("\n--- TEST GROUP: Git Context ---")

test("Git context exists", lambda: ctx["gitContext"] is not None)
test("Git repository detected", lambda: ctx["gitContext"]["isRepository"])
test("Git branch detected", lambda: ctx["gitContext"]["branch"] is not None)

print(f"  Is repo: {ctx['gitContext']['isRepository']}")
print(f"  Branch: {ctx['gitContext']['branch']}")
print(f"  Dirty: {ctx['gitContext']['dirty']}")

# TEST 8: Memory System
print("\n--- TEST GROUP: Findings and Memory Persistence ---")

mem = get_json(f"projects/{project_id}/memory")
test("Memories persisted", lambda: len(mem) > 0)
print(f"  Memory entries: {len(mem)}")

facts = [m for m in mem if m["type"] == "fact"]
conventions = [m for m in mem if m["type"] == "convention"]

test("Facts recorded", lambda: len(facts) > 0)
test("Conventions recorded", lambda: len(conventions) > 0)

print(f"  Facts: {len(facts)}")
print(f"  Conventions: {len(conventions)}")

# TEST 9: Events
print("\n--- TEST GROUP: Events and Audit Trail ---")

events = get_json(f"projects/{project_id}/events")
test("Events recorded", lambda: len(events) > 0)
print(f"  Total events: {len(events)}")

# TEST 10: Database Consistency
print("\n--- TEST GROUP: Database Consistency ---")

proj2 = get_json("projects/current")
test("Phase1 context in profile", lambda: "phase1_context" in proj2.get("profile", {}))

# SUMMARY
print("\n========================================")
print("PHASE 1 CORE TESTS SUMMARY")
print("========================================")
print(f"PASSED: {tests_passed}")
print(f"WARNINGS: {tests_warning}")
print(f"FAILED: {tests_failed}")
total = tests_passed + tests_failed + tests_warning
pass_rate = (tests_passed / total * 100) if total > 0 else 0
print(f"Pass Rate: {pass_rate:.1f}% ({tests_passed}/{total})")
print("========================================\n")

if tests_failed == 0:
    print("STATUS: [PASS] ALL TESTS PASSED")
    sys.exit(0)
elif tests_failed <= 2:
    print("STATUS: [WARN] MOSTLY PASSED")
    sys.exit(1)
else:
    print("STATUS: [FAIL] TESTS FAILED")
    sys.exit(2)
