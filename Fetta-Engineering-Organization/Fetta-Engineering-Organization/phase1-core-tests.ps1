# Phase 1 Core Functionality Tests (No LLM Required)
# Tests repository scanning, context layer, findings, and persistence

param(
    [string]$ApiBase = "http://localhost:8080/api",
    [string]$RepositoryPath = "C:\Users\as\Downloads\Fetta-Engineering-Organization\Fetta-Engineering-Organization"
)

$ErrorActionPreference = "Continue"  # Don't stop on errors, continue testing
$testsPassed = 0
$testsFailed = 0
$testsWarning = 0

function Invoke-TestApi {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [object]$Body,
        [scriptblock]$Validation
    )
    
    try {
        $uri = "$ApiBase/$Endpoint"
        $response = if ($Body) {
            Invoke-WebRequest -Uri $uri -Method $Method -Headers @{"Content-Type" = "application/json"} -Body ($Body | ConvertTo-Json -Depth 10) -UseBasicParsing
        } else {
            Invoke-WebRequest -Uri $uri -Method $Method -UseBasicParsing
        }
        
        $result = $response.Content | ConvertFrom-Json
        
        if ($Validation) {
            $valid = & $Validation $result
            if ($valid -eq $true) {
                Write-Host "[PASS] $Name" -ForegroundColor Green
                $script:testsPassed++
                return $result
            } else {
                Write-Host "[FAIL] $Name - $valid" -ForegroundColor Red
                $script:testsFailed++
                return $result
            }
        } else {
            Write-Host "[PASS] $Name" -ForegroundColor Green
            $script:testsPassed++
            return $result
        }
    } catch {
        Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $null
    }
}

Write-Host "`n===== PHASE 1 CORE FUNCTIONALITY TESTS =====`n" -ForegroundColor Cyan

# Get project
$proj = Invoke-TestApi -Name "Load project" -Method GET -Endpoint "projects/current" -Validation {
    param($r) $r.id -and $r.repositoryPath
}
$projectId = $proj.id

# TEST 1: Repository Scanning
Write-Host "`n--- TEST GROUP: Repository Scanning ---" -ForegroundColor Yellow

$scan = Invoke-TestApi -Name "Phase 1 scan" -Method POST -Endpoint "projects/$projectId/phase1/attach" -Body @{ repositoryPath = $RepositoryPath } -Validation {
    param($r) $r.success -and $r.scan.filesScanned -gt 0
}

if ($scan) {
    Invoke-TestApi -Name "  ├─ Scan duration recorded" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
        param($r) $r.scan.durationMs -gt 0
    } | Out-Null
    
    Invoke-TestApi -Name "  ├─ Files scanned recorded" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
        param($r) $r.scan.filesScanned -eq $scan.scan.filesScanned
    } | Out-Null
    
    Invoke-TestApi -Name "  └─ Bytes scanned recorded" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
        param($r) $r.scan.bytesScanned -gt 0
    } | Out-Null
}

# TEST 2: Repository Identity
Write-Host "`n--- TEST GROUP: Repository Identity ---" -ForegroundColor Yellow

$ctx = Invoke-TestApi -Name "Repository identity captured" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
    param($r) $r.repositoryIdentity.root -and $r.repositoryIdentity.fileCount -and $r.repositoryIdentity.directoryCount
}

if ($ctx) {
    Write-Host "  Root path: $($ctx.repositoryIdentity.root)" -ForegroundColor Gray
    Write-Host "  Files: $($ctx.repositoryIdentity.fileCount)" -ForegroundColor Gray
    Write-Host "  Directories: $($ctx.repositoryIdentity.directoryCount)" -ForegroundColor Gray
    
    if ($ctx.repositoryIdentity.root -eq $RepositoryPath) {
        Write-Host "  ✅ Repository root matches supplied path" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ❌ Repository root mismatch: expected $RepositoryPath, got $($ctx.repositoryIdentity.root)" -ForegroundColor Red
        $script:testsFailed++
    }
}

# TEST 3: Technology Detection
Write-Host "`n--- TEST GROUP: Technology Detection ---" -ForegroundColor Yellow

$techs = Invoke-TestApi -Name "Technologies detected" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
    param($r) $r.technologies -is [array]
}

if ($techs -and $techs.technologies) {
    Write-Host "  Detected: $($techs.technologies | ForEach-Object { "$($_.name)" }) " -ForegroundColor Gray
    
    $hasTypeScript = $techs.technologies | Where-Object { $_.name -eq "TypeScript" }
    $hasJavaScript = $techs.technologies | Where-Object { $_.name -eq "JavaScript" }
    
    if ($hasTypeScript) {
        Write-Host "  ✅ TypeScript detected" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ⚠️  TypeScript not detected" -ForegroundColor Yellow
        $script:testsWarning++
    }
    
    if ($hasJavaScript) {
        Write-Host "  ✅ JavaScript detected" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ⚠️  JavaScript not detected" -ForegroundColor Yellow
        $script:testsWarning++
    }
}

# TEST 4: Entry Points Detection
Write-Host "`n--- TEST GROUP: Entry Point Detection ---" -ForegroundColor Yellow

$eps = Invoke-TestApi -Name "Entry points detected" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
    param($r) $r.entryPoints -is [array] -and $r.entryPoints.Count -gt 0
}

if ($eps -and $eps.entryPoints) {
    Write-Host "  Found $($eps.entryPoints.Count) entry points:" -ForegroundColor Gray
    $eps.entryPoints | Select-Object -First 3 | ForEach-Object {
        Write-Host "    - $($_.type): $($_.path)" -ForegroundColor Gray
    }
}

# TEST 5: Repository Structure Analysis
Write-Host "`n--- TEST GROUP: Repository Structure ---" -ForegroundColor Yellow

$struct = Invoke-TestApi -Name "Structure classification" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
    param($r) $r.structure.classification
}

if ($struct -and $struct.structure) {
    Write-Host "  Classification: $($struct.structure.classification)" -ForegroundColor Gray
    Write-Host "  Has workspaces: $($struct.structure.hasWorkspaces)" -ForegroundColor Gray
}

# TEST 6: Fingerprinting & Determinism
Write-Host "`n--- TEST GROUP: Fingerprinting and Determinism ---" -ForegroundColor Yellow

$fp1 = Invoke-TestApi -Name "Fingerprint generated" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
    param($r) $r.fingerprint.hash -and $r.fingerprint.hash.Length -eq 64
}

if ($fp1) {
    Write-Host "  Hash: $($fp1.fingerprint.hash.substring(0, 16))..." -ForegroundColor Gray
    
    # Rescan
    Start-Sleep -Seconds 1
    Invoke-TestApi -Name "Rescan accepted" -Method POST -Endpoint "projects/$projectId/phase1/attach" -Body @{ repositoryPath = $RepositoryPath } -Validation {
        param($r) $r.success
    } | Out-Null
    
    $fp2 = Invoke-TestApi -Name "Fingerprint determinism" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
        param($r) $r.fingerprint.hash -eq $fp1.fingerprint.hash
    }
    
    if ($fp2 -and $fp2.fingerprint.hash -eq $fp1.fingerprint.hash) {
        Write-Host "  ✅ Fingerprints match (deterministic)" -ForegroundColor Green
        $script:testsPassed++
    } elseif ($fp2) {
        Write-Host "  ❌ Fingerprints differ (non-deterministic): $($fp2.fingerprint.hash.substring(0, 16))... vs $($fp1.fingerprint.hash.substring(0, 16))..." -ForegroundColor Red
        $script:testsFailed++
    }
}

# TEST 7: Git Context
Write-Host "`n--- TEST GROUP: Git Context ---" -ForegroundColor Yellow

$git = Invoke-TestApi -Name "Git context captured" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
    param($r) $r.gitContext.isRepository -and $r.gitContext.branch
}

if ($git -and $git.gitContext) {
    Write-Host "  Is repository: $($git.gitContext.isRepository)" -ForegroundColor Gray
    Write-Host "  Branch: $($git.gitContext.branch)" -ForegroundColor Gray
    Write-Host "  Dirty: $($git.gitContext.dirty)" -ForegroundColor Gray
}

# TEST 8: Persistence - Memory System
Write-Host "`n--- TEST GROUP: Findings and Memory Persistence ---" -ForegroundColor Yellow

$mem = Invoke-TestApi -Name "Memories persisted" -Method GET -Endpoint "projects/$projectId/memory" -Validation {
    param($r) $r -is [array] -and $r.Count -gt 0
}

if ($mem) {
    Write-Host "  Memory entries: $($mem.Count)" -ForegroundColor Gray
    
    $facts = $mem | Where-Object { $_.type -eq "fact" }
    $conventions = $mem | Where-Object { $_.type -eq "convention" }
    
    if ($facts) {
        Write-Host "  ✅ Facts stored ($($facts.Count))" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ❌ No facts stored" -ForegroundColor Red
        $script:testsFailed++
    }
    
    if ($conventions) {
        Write-Host "  ✅ Conventions stored ($($conventions.Count))" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ⚠️  No conventions stored" -ForegroundColor Yellow
        $script:testsWarning++
    }
}

# TEST 9: Events & Audit Trail
Write-Host "`n--- TEST GROUP: Events and Audit Trail ---" -ForegroundColor Yellow

$events = Invoke-TestApi -Name "Events recorded" -Method GET -Endpoint "projects/$projectId/events" -Validation {
    param($r) $r -is [array] -and $r.Count -gt 0
}

if ($events) {
    Write-Host "  Total events: $($events.Count)" -ForegroundColor Gray
    
    $scanEvents = $events | Where-Object { $_.type -like "phase1*" }
    if ($scanEvents) {
        Write-Host "  ✅ Phase 1 events recorded ($($scanEvents.Count))" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ⚠️  No Phase 1 events found" -ForegroundColor Yellow
        $script:testsWarning++
    }
}

# TEST 10: Path Security Validation
Write-Host "`n--- TEST GROUP: Path Security ---" -ForegroundColor Yellow

Write-Host "  Testing path validation..." -ForegroundColor Gray

# Test 1: Valid nested path (should pass)
$validNested = Invoke-TestApi -Name "Accept valid nested path" -Method POST -Endpoint "projects/$projectId/phase1/attach" -Body @{ repositoryPath = "$RepositoryPath\artifacts" } -Validation {
    param($r) -not $r.error  # Should not have error
}

# Test 2: Parent traversal (should fail)
Write-Host "  Testing parent directory rejection..." -ForegroundColor Gray
try {
    $evil1 = Invoke-WebRequest -Uri "$ApiBase/projects/$projectId/phase1/attach" -Method POST -Headers @{"Content-Type" = "application/json"} -Body (@{ repositoryPath = "$RepositoryPath\.." } | ConvertTo-Json -Depth 10) -UseBasicParsing -ErrorAction Stop
    if ($evil1.Content | Select-String "error") {
        Write-Host "  ✅ Parent directory blocked" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ❌ Parent directory not blocked" -ForegroundColor Red
        $script:testsFailed++
    }
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "  ✅ Parent directory blocked (400)" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ⚠️  Rejected but unclear reason: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
        $script:testsWarning++
    }
}

# TEST 11: Database Consistency
Write-Host "`n--- TEST GROUP: Database Consistency ---" -ForegroundColor Yellow

$db1 = Invoke-TestApi -Name "Projects table has project" -Method GET -Endpoint "projects/current" -Validation {
    param($r) $r.id -and $r.profile
}

if ($db1 -and $db1.profile) {
    if ($db1.profile.phase1_context) {
        Write-Host "  ✅ Phase 1 context stored in projects.profile" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ❌ Phase 1 context missing from projects.profile" -ForegroundColor Red
        $script:testsFailed++
    }
}

# SUMMARY
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PHASE 1 CORE TESTS SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ PASSED: $testsPassed" -ForegroundColor Green
Write-Host "⚠️  WARNINGS: $testsWarning" -ForegroundColor Yellow
Write-Host "❌ FAILED: $testsFailed" -ForegroundColor Red
Write-Host "========================================`n" -ForegroundColor Cyan

$total = $testsPassed + $testsFailed + $testsWarning
$passRate = if ($total -gt 0) { [math]::Round(($testsPassed / $total) * 100, 1) } else { 0 }

Write-Host "Pass Rate: $passRate% ($testsPassed/$total)" -ForegroundColor Cyan

if ($testsFailed -eq 0) {
    Write-Host "STATUS: [PASS] ALL TESTS PASSED" -ForegroundColor Green
    exit 0
} elseif ($testsFailed -le 2) {
    Write-Host "STATUS: [WARN] MOSTLY PASSED (minor issues)" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "STATUS: [FAIL] TESTS FAILED" -ForegroundColor Red
    exit 2
}
