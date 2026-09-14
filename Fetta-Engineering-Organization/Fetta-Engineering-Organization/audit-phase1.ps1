# Phase 1 Audit Test Script
# This script runs the full audit sequence against the Fetta repository

param(
    [string]$ProjectId = "fetta-project",
    [string]$RepositoryPath = "C:\Users\as\Downloads\Fetta-Engineering-Organization\Fetta-Engineering-Organization",
    [string]$ApiBase = "http://localhost:8080/api"
)

$ErrorActionPreference = "Stop"

# Helper function to make API calls
function Invoke-Api {
    param(
        [string]$Method,
        [string]$Endpoint,
        [object]$Body
    )
    
    $uri = "$ApiBase/$Endpoint"
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    Write-Host "[$Method] $uri" -ForegroundColor Cyan
    
    if ($Body) {
        $bodyJson = $Body | ConvertTo-Json -Depth 10
        Write-Host "Body: $bodyJson" -ForegroundColor DarkGray
    }
    
    try {
        $response = if ($Body) {
            Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json -Depth 10) -UseBasicParsing
        } else {
            Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -UseBasicParsing
        }
        
        $result = $response.Content | ConvertFrom-Json
        Write-Host "Status: $($response.StatusCode) OK" -ForegroundColor Green
        return $result
    }
    catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host $_.Exception.Response.Content -ForegroundColor Red
        }
        throw $_
    }
}

Write-Host "`n========================================`n" -ForegroundColor Yellow
Write-Host "PHASE 1 AUDIT TEST SEQUENCE" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

# TEST A: Initial Scan
Write-Host "`nTEST A: Initial Scan`n" -ForegroundColor Magenta

$startTime = Get-Date
Write-Host "Attaching repository: $RepositoryPath"
$attachResult = Invoke-Api -Method POST -Endpoint "projects/$ProjectId/phase1/attach" -Body @{
    repositoryPath = $RepositoryPath
}

$duration = (Get-Date) - $startTime

Write-Host "`nAttach Result:" -ForegroundColor Cyan
Write-Host "  Scan ID: $($attachResult.scanId)" -ForegroundColor Gray
Write-Host "  Duration: $($attachResult.scan.duration)ms" -ForegroundColor Gray
Write-Host "  Files Scanned: $($attachResult.scan.filesScanned)" -ForegroundColor Gray
Write-Host "  Files Skipped: $($attachResult.scan.filesSkipped)" -ForegroundColor Gray
Write-Host "  Bytes Scanned: $($attachResult.scan.bytesScanned)" -ForegroundColor Gray
Write-Host "  Errors: $($attachResult.scan.errors.Count)" -ForegroundColor Gray
Write-Host "  Technologies Detected: $($attachResult.context.technologies)" -ForegroundColor Gray
Write-Host "  Entry Points: $($attachResult.context.entryPoints)" -ForegroundColor Gray
Write-Host "  Classification: $($attachResult.context.classification)" -ForegroundColor Gray

# Save baseline
$testA = @{
    duration = $attachResult.scan.duration
    filesScanned = $attachResult.scan.filesScanned
    filesSkipped = $attachResult.scan.filesSkipped
    bytesScanned = $attachResult.scan.bytesScanned
    technologies = $attachResult.context.technologies
    entryPoints = $attachResult.context.entryPoints
    scanId = $attachResult.scanId
}

# Now retrieve full context
Write-Host "`nRetrieving full Phase 1 context...`n" -ForegroundColor Cyan
$contextResult = Invoke-Api -Method GET -Endpoint "projects/$ProjectId/phase1/context" -Body $null

Write-Host "`nContext Retrieved:" -ForegroundColor Green
Write-Host "  Repository Root: $($contextResult.repositoryIdentity.root)" -ForegroundColor Gray
Write-Host "  Repository Name: $($contextResult.repositoryIdentity.repositoryName)" -ForegroundColor Gray
Write-Host "  File Count: $($contextResult.repositoryIdentity.fileCount)" -ForegroundColor Gray
Write-Host "  Directory Count: $($contextResult.repositoryIdentity.directoryCount)" -ForegroundColor Gray
Write-Host "  Scan Version: $($contextResult.scan.version)" -ForegroundColor Gray
Write-Host "  Git Branch: $($contextResult.gitContext.branch)" -ForegroundColor Gray
Write-Host "  Git Dirty: $($contextResult.gitContext.dirty)" -ForegroundColor Gray
Write-Host "  Technologies Count: $($contextResult.technologies.Count)" -ForegroundColor Gray

# Dump technologies if any
if ($contextResult.technologies.Count -gt 0) {
    Write-Host "`nDetected Technologies:" -ForegroundColor Cyan
    foreach ($tech in $contextResult.technologies) {
        Write-Host "  - $($tech.name) (confidence: $($tech.confidence))" -ForegroundColor Gray
    }
}

# Dump entry points
Write-Host "`nEntry Points ($($contextResult.entryPoints.Count)):" -ForegroundColor Cyan
foreach ($ep in $contextResult.entryPoints) {
    Write-Host "  - $($ep.name) [$($ep.type)] at $($ep.location)" -ForegroundColor Gray
}

# Store fingerprint
$fingerprint1 = $contextResult.fingerprint.hash

Write-Host "`nFingerprint (Test A): $fingerprint1" -ForegroundColor Yellow

# TEST B: Identical Second Scan (No Changes)
Write-Host "`n`nTEST B: Identical Second Scan (No Changes)`n" -ForegroundColor Magenta

Start-Sleep -Seconds 1

$startTime = Get-Date
$attachResult2 = Invoke-Api -Method POST -Endpoint "projects/$ProjectId/phase1/attach" -Body @{
    repositoryPath = $RepositoryPath
}
$duration2 = (Get-Date) - $startTime

$testB = @{
    duration = $attachResult2.scan.duration
    filesScanned = $attachResult2.scan.filesScanned
    filesSkipped = $attachResult2.scan.filesSkipped
    bytesScanned = $attachResult2.scan.bytesScanned
    technologies = $attachResult2.context.technologies
    entryPoints = $attachResult2.context.entryPoints
    scanId = $attachResult2.scanId
}

Write-Host "Scan B Results:" -ForegroundColor Cyan
Write-Host "  Duration: $($testB.duration)ms" -ForegroundColor Gray
Write-Host "  Files Scanned: $($testB.filesScanned)" -ForegroundColor Gray
Write-Host "  Files Skipped: $($testB.filesSkipped)" -ForegroundColor Gray
Write-Host "  Bytes Scanned: $($testB.bytesScanned)" -ForegroundColor Gray
Write-Host "  Technologies: $($testB.technologies)" -ForegroundColor Gray

$contextResult2 = Invoke-Api -Method GET -Endpoint "projects/$ProjectId/phase1/context" -Body $null
$fingerprint2 = $contextResult2.fingerprint.hash

Write-Host "Fingerprint (Test B): $fingerprint2" -ForegroundColor Yellow

# Compare
$fingerprintMatch = ($fingerprint1 -eq $fingerprint2)
Write-Host "Fingerprints Match: $fingerprintMatch" -ForegroundColor $(if ($fingerprintMatch) { "Green" } else { "Red" })

Write-Host "`n========================================`n" -ForegroundColor Yellow
Write-Host "SUMMARY" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

Write-Host "Test A Metrics:" -ForegroundColor Cyan
$testA | Format-Table -AutoSize

Write-Host "`nTest B Metrics:" -ForegroundColor Cyan
$testB | Format-Table -AutoSize

Write-Host "`nComparison:" -ForegroundColor Cyan
Write-Host "  Duration Change: $($testA.duration)ms -> $($testB.duration)ms" -ForegroundColor Gray
Write-Host "  Files Scanned Same: $($testA.filesScanned -eq $testB.filesScanned)" -ForegroundColor Gray
Write-Host "  Fingerprints Match: $fingerprintMatch" -ForegroundColor Gray
Write-Host "  Scan IDs Different: $($testA.scanId -ne $testB.scanId)" -ForegroundColor Gray

Write-Host "`nKey Findings:" -ForegroundColor Yellow
Write-Host "  Repository Root Reported: $($contextResult.repositoryIdentity.root)" -ForegroundColor Gray
Write-Host "  Supplied Path: $RepositoryPath" -ForegroundColor Gray
Write-Host "  Match: $($contextResult.repositoryIdentity.root -eq $RepositoryPath)" -ForegroundColor Gray

Write-Host "`n========================================`n" -ForegroundColor Green
Write-Host "Audit Complete`n" -ForegroundColor Green
