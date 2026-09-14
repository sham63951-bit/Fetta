# Phase 1 Completion Test Suite
# Tests all critical Phase 1 requirements end-to-end

param(
    [string]$ApiBase = "http://localhost:8080/api",
    [string]$RepositoryPath = "C:\Users\as\Downloads\Fetta-Engineering-Organization\Fetta-Engineering-Organization"
)

$ErrorActionPreference = "Stop"
$testsPassed = 0
$testsFailed = 0
$testsPartial = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [object]$Body,
        [scriptblock]$Validation
    )
    
    Write-Host "`n[$($Method)] $Endpoint" -ForegroundColor Cyan
    
    try {
        $uri = "$ApiBase/$Endpoint"
        $response = if ($Body) {
            Invoke-WebRequest -Uri $uri -Method $Method -Headers @{"Content-Type" = "application/json"} -Body ($Body | ConvertTo-Json -Depth 10) -UseBasicParsing
        } else {
            Invoke-WebRequest -Uri $uri -Method $Method -UseBasicParsing
        }
        
        $result = $response.Content | ConvertFrom-Json
        
        if ($Validation) {
            $passed = & $Validation $result $response
            if ($passed -eq $true) {
                Write-Host "✅ PASS: $Name" -ForegroundColor Green
                $script:testsPassed++
                return $result
            } elseif ($passed -eq "partial") {
                Write-Host "⚠️ PARTIAL: $Name" -ForegroundColor Yellow
                $script:testsPartial++
                return $result
            } else {
                Write-Host "❌ FAIL: $Name" -ForegroundColor Red
                if ($passed -is [string]) {
                    Write-Host "  Reason: $passed" -ForegroundColor Red
                }
                $script:testsFailed++
                return $result
            }
        } else {
            Write-Host "✅ PASS: $Name (no validation)" -ForegroundColor Green
            $script:testsPassed++
            return $result
        }
    } catch {
        Write-Host "❌ FAIL: $Name - $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $null
    }
}

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "PHASE 1 COMPLETION TEST SUITE" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

# TEST 1: Application Startup & Health
Write-Host "`n### TEST GROUP 1: APPLICATION STARTUP & HEALTH" -ForegroundColor Magenta

Test-Endpoint -Name "Health check" -Method GET -Endpoint "health" -Validation {
    param($result, $response)
    $result.status -eq "ok" -and $response.StatusCode -eq 200
}

# TEST 2: Project Creation & Initialization
Write-Host "`n### TEST GROUP 2: PROJECT CREATION & CORE COMPONENTS" -ForegroundColor Magenta

$projectResult = Test-Endpoint -Name "Get current project" -Method GET -Endpoint "projects/current" -Validation {
    param($result, $response)
    $result.id -and $result.name -and $result.repositoryPath -and $result.status
}

if ($projectResult) {
    $projectId = $projectResult.id
    Write-Host "  Project ID: $projectId" -ForegroundColor Gray
    Write-Host "  Project Name: $($projectResult.name)" -ForegroundColor Gray
    Write-Host "  Repository Path: $($projectResult.repositoryPath)" -ForegroundColor Gray
}

# TEST 3: Phase 1 Scanning
Write-Host "`n### TEST GROUP 3: PHASE 1 REPOSITORY SCANNING" -ForegroundColor Magenta

$scanBody = @{ repositoryPath = $RepositoryPath }
$scanResult = Test-Endpoint -Name "Phase 1 repository scan" -Method POST -Endpoint "projects/$projectId/phase1/attach" -Body $scanBody -Validation {
    param($result, $response)
    $result.success -eq $true -and $result.scanId -and $result.scan.filesScanned -gt 0 -and $result.scan.duration -gt 0
}

if ($scanResult) {
    Write-Host "  Scan ID: $($scanResult.scanId)" -ForegroundColor Gray
    Write-Host "  Duration: $($scanResult.scan.duration)ms" -ForegroundColor Gray
    Write-Host "  Files Scanned: $($scanResult.scan.filesScanned)" -ForegroundColor Gray
    Write-Host "  Files Skipped: $($scanResult.scan.filesSkipped)" -ForegroundColor Gray
    Write-Host "  Bytes: $($scanResult.scan.bytesScanned)" -ForegroundColor Gray
    Write-Host "  Technologies: $($scanResult.context.technologies)" -ForegroundColor Gray
    Write-Host "  Entry Points: $($scanResult.context.entryPoints)" -ForegroundColor Gray
    Write-Host "  Classification: $($scanResult.context.classification)" -ForegroundColor Gray
}

# TEST 4: Context Retrieval & Project Context Layer
Write-Host "`n### TEST GROUP 4: PROJECT CONTEXT LAYER" -ForegroundColor Magenta

$contextResult = Test-Endpoint -Name "Retrieve Phase 1 context" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
    param($result, $response)
    $result.repositoryIdentity -and `
    $result.technologies -and `
    $result.entryPoints -and `
    $result.fingerprint -and `
    $result.gitContext -and `
    $result.scan
}

if ($contextResult) {
    Write-Host "  Repository Root: $($contextResult.repositoryIdentity.root)" -ForegroundColor Gray
    Write-Host "  Technologies Detected: $($contextResult.technologies.Count)" -ForegroundColor Gray
    if ($contextResult.technologies.Count -gt 0) {
        foreach ($tech in $contextResult.technologies) {
            Write-Host "    - $($tech.name) ($($tech.category))" -ForegroundColor Gray
        }
    }
    Write-Host "  Entry Points: $($contextResult.entryPoints.Count)" -ForegroundColor Gray
    Write-Host "  Fingerprint Hash: $($contextResult.fingerprint.hash.substring(0, 16))..." -ForegroundColor Gray
    Write-Host "  Git Branch: $($contextResult.gitContext.branch)" -ForegroundColor Gray
    Write-Host "  Git Dirty: $($contextResult.gitContext.dirty)" -ForegroundColor Gray
}

# TEST 5: Findings & Memory System
Write-Host "`n### TEST GROUP 5: FINDINGS & MEMORY SYSTEM" -ForegroundColor Magenta

$memoryResult = Test-Endpoint -Name "Retrieve project memory" -Method GET -Endpoint "projects/$projectId/memory" -Validation {
    param($result, $response)
    $result -is [array] -or ($result.Count -ge 0)
}

if ($memoryResult) {
    Write-Host "  Memory entries: $($memoryResult.Count)" -ForegroundColor Gray
    if ($memoryResult.Count -gt 0) {
        $memoryResult | Select-Object -First 3 | ForEach-Object {
            Write-Host "    [$($_.type)] $($_.title)" -ForegroundColor Gray
        }
    }
}

# TEST 6: Agent Definitions
Write-Host "`n### TEST GROUP 6: AGENT FOUNDATION" -ForegroundColor Magenta

$agentsResult = Test-Endpoint -Name "List project agents" -Method GET -Endpoint "projects/$projectId/agents" -Validation {
    param($result, $response)
    $result -is [array] -and $result.Count -ge 3  # At least coordinator, architect, engineer
}

if ($agentsResult) {
    Write-Host "  Agents defined: $($agentsResult.Count)" -ForegroundColor Gray
    $agentsResult | ForEach-Object {
        Write-Host "    - $($_.name) ($($_.role)): $($_.currentActivity)" -ForegroundColor Gray
    }
}

# TEST 7: Task Creation & Execution
Write-Host "`n### TEST GROUP 7: TASK EXECUTION & ORCHESTRATION" -ForegroundColor Magenta

$taskBody = @{ objective = "TEST: Verify Phase 1 foundation is working - just a quick analysis, no modifications" }
$taskResult = Test-Endpoint -Name "Create task" -Method POST -Endpoint "projects/$projectId/tasks" -Body $taskBody -Validation {
    param($result, $response)
    $result.id -and $result.status -eq "ready" -and $result.objective
}

if ($taskResult) {
    $taskId = $taskResult.id
    Write-Host "  Task ID: $taskId" -ForegroundColor Gray
    Write-Host "  Status: $($taskResult.status)" -ForegroundColor Gray
    Write-Host "  Objective: $($taskResult.objective)" -ForegroundColor Gray
    
    # TEST 7b: Execute task
    Write-Host "`n  Executing task..." -ForegroundColor Cyan
    $execResult = Test-Endpoint -Name "Execute task" -Method POST -Endpoint "projects/$projectId/tasks/$taskId/run" -Validation {
        param($result, $response)
        $result.status -eq "running" -or $result.status -eq "completed"  # May complete immediately or be async
    }
    
    if ($execResult) {
        Write-Host "  Execution Status: $($execResult.status)" -ForegroundColor Gray
        Write-Host "  Verification State: $($execResult.verificationState)" -ForegroundColor Gray
        
        if ($execResult.status -eq "running") {
            Write-Host "  (Task is async - waiting for completion...)" -ForegroundColor Gray
            Start-Sleep -Seconds 5
            
            # Try to fetch updated status
            $statusResult = Test-Endpoint -Name "Check task status after execution" -Method GET -Endpoint "projects/$projectId/tasks" -Validation {
                param($result, $response)
                $result -is [array]
            }
            
            if ($statusResult) {
                $updatedTask = $statusResult | Where-Object { $_.id -eq $taskId } | Select-Object -First 1
                if ($updatedTask) {
                    Write-Host "  Updated Status: $($updatedTask.status)" -ForegroundColor Gray
                    Write-Host "  Verification: $($updatedTask.verificationState)" -ForegroundColor Gray
                    if ($updatedTask.summary) {
                        Write-Host "  Summary: $($updatedTask.summary.substring(0, 100))..." -ForegroundColor Gray
                    }
                }
            }
        } elseif ($execResult.summary) {
            Write-Host "  Summary: $($execResult.summary.substring(0, 100))..." -ForegroundColor Gray
        }
    }
}

# TEST 8: Events & Audit Trail
Write-Host "`n### TEST GROUP 8: AUDIT TRAIL & EVENTS" -ForegroundColor Magenta

$eventsResult = Test-Endpoint -Name "Retrieve project events" -Method GET -Endpoint "projects/$projectId/events" -Validation {
    param($result, $response)
    $result -is [array] -and $result.Count -ge 1
}

if ($eventsResult) {
    Write-Host "  Events recorded: $($eventsResult.Count)" -ForegroundColor Gray
    $eventsResult | Select-Object -First 3 | ForEach-Object {
        Write-Host "    [$($_.type)] $($_.message)" -ForegroundColor Gray
    }
}

# TEST 9: Determinism & Consistency
Write-Host "`n### TEST GROUP 9: DETERMINISM & CONSISTENCY" -ForegroundColor Magenta

Write-Host "  Running second scan on same repository (should be deterministic)..." -ForegroundColor Cyan
Start-Sleep -Seconds 1

$scan2Result = Test-Endpoint -Name "Second Phase 1 scan (determinism test)" -Method POST -Endpoint "projects/$projectId/phase1/attach" -Body $scanBody -Validation {
    param($result, $response)
    $result.success -eq $true
}

if ($scan2Result -and $scanResult) {
    $fp1 = $contextResult.fingerprint.hash
    
    # Retrieve new context
    $context2Result = Test-Endpoint -Name "Retrieve Phase 1 context after second scan" -Method GET -Endpoint "projects/$projectId/phase1/context" -Validation {
        param($result, $response)
        $result.fingerprint -and $result.fingerprint.hash
    }
    
    if ($context2Result) {
        $fp2 = $context2Result.fingerprint.hash
        if ($fp1 -eq $fp2) {
            Write-Host "✅ Fingerprints match (deterministic): $fp1.substring(0, 16)..." -ForegroundColor Green
            $script:testsPassed++
        } else {
            Write-Host "❌ Fingerprints differ (non-deterministic)" -ForegroundColor Red
            Write-Host "  First:  $fp1" -ForegroundColor Red
            Write-Host "  Second: $fp2" -ForegroundColor Red
            $script:testsFailed++
        }
    }
}

# TEST 10: Error Handling & Boundaries
Write-Host "`n### TEST GROUP 10: SECURITY & BOUNDARIES" -ForegroundColor Magenta

Write-Host "  Testing path traversal prevention..." -ForegroundColor Cyan
$evilPath = "C:\Windows\System32"
$evilBody = @{ repositoryPath = $evilPath }

try {
    $evilResult = Invoke-WebRequest -Uri "$ApiBase/projects/$projectId/phase1/attach" -Method POST -Headers @{"Content-Type" = "application/json"} -Body ($evilBody | ConvertTo-Json -Depth 10) -UseBasicParsing -ErrorAction Stop
    Write-Host "❌ FAIL: Path traversal not blocked - accepted: $evilPath" -ForegroundColor Red
    $script:testsFailed++
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✅ PASS: Path traversal blocked (400 Bad Request)" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "⚠️ PARTIAL: Path rejected but with wrong status code ($($_.Exception.Response.StatusCode))" -ForegroundColor Yellow
        $script:testsPartial++
    }
}

# SUMMARY
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "TEST SUMMARY" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "✅ Passed:   $testsPassed" -ForegroundColor Green
Write-Host "⚠️  Partial:  $testsPartial" -ForegroundColor Yellow
Write-Host "❌ Failed:   $testsFailed" -ForegroundColor Red
Write-Host "========================================`n" -ForegroundColor Yellow

if ($testsFailed -eq 0) {
    Write-Host "OVERALL RESULT: PASS ✅" -ForegroundColor Green
    exit 0
} elseif ($testsFailed -le 2) {
    Write-Host "OVERALL RESULT: PARTIAL ⚠️" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "OVERALL RESULT: FAIL ❌" -ForegroundColor Red
    exit 2
}
