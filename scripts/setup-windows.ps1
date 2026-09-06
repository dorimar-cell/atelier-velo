#requires -Version 5.1
<#
.SYNOPSIS
  Automates Atelier Velo setup on Windows after Git and Node.js are installed.

.DESCRIPTION
  Does steps 2-5 from the setup guide for feat/flame-wrap-complete:
    2. Clone the repo (or reuse a copied folder)
    3. Check out feat/flame-wrap-complete
    4. npm install
    5. Start Vite, wait for HTTP 200, open the snap preset (Flame Wrap finale)

  Step 1 (install Git / Node) is intentionally not automated.

.PARAMETER RepoUrl
  Git remote. Default: https://github.com/dorimar-cell/atelier-velo.git

.PARAMETER Branch
  Branch to check out. Default: feat/flame-wrap-complete

.PARAMETER TargetDir
  Where to clone if the current folder is not already the project.
  Default: .\atelier-velo next to the current directory.

.PARAMETER Port
  Vite port to wait for. Default: 5173

.PARAMETER RebuildParts
  Also fix process_parts.py ROOT, install Python deps, and run npm run parts.

.PARAMETER NoDev
  Stop after npm install (do not start the server).

.PARAMETER NoBrowser
  Start the server but do not open a browser.
#>
[CmdletBinding()]
param(
  [string]$RepoUrl = "https://github.com/dorimar-cell/atelier-velo.git",
  [string]$Branch = "feat/flame-wrap-complete",
  [string]$TargetDir = "",
  [int]$Port = 5173,
  [switch]$RebuildParts,
  [switch]$NoDev,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$PresetQuery = "pick=artik-white,scope-artech,manto-bar,nack-seat,sram-red,cass-xplr,brake-force,bottles-two&snap"
$DevUrl = "http://127.0.0.1:$Port"
$PresetUrl = "$DevUrl/?$PresetQuery"

function Write-Step([int]$n, [string]$message) {
  Write-Host ""
  Write-Host "[$n] $message" -ForegroundColor Cyan
}

function Fail([string]$message) {
  Write-Host ""
  Write-Host "ERROR: $message" -ForegroundColor Red
  exit 1
}

function Get-CommandPath([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  return $cmd.Source
}

function Test-ProjectRoot([string]$path) {
  $pkg = Join-Path $path "package.json"
  $index = Join-Path $path "index.html"
  return (Test-Path $pkg) -and (Test-Path $index)
}

function Test-HttpOk([string]$url) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Get-NpmCmd {
  $npmCmd = Get-CommandPath "npm.cmd"
  if ($npmCmd) { return $npmCmd }
  $node = Get-CommandPath "node"
  if ($node) {
    $sibling = Join-Path (Split-Path $node -Parent) "npm.cmd"
    if (Test-Path $sibling) { return $sibling }
  }
  return $null
}

function Invoke-Npm {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [Parameter(Mandatory = $true)][string[]]$NpmArgs
  )
  $npm = Get-NpmCmd
  if (-not $npm) { Fail "npm.cmd not found. Install Node.js 18+ and open a new terminal." }
  $quoted = $NpmArgs | ForEach-Object { if ($_ -match "\s") { '"' + $_ + '"' } else { $_ } }
  $argLine = $quoted -join " "
  $p = Start-Process -FilePath $npm -ArgumentList $argLine -WorkingDirectory $ProjectRoot -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0) {
    Fail "npm $argLine exited with code $($p.ExitCode)"
  }
}

Write-Host "Atelier Velo - Windows auto-setup (steps 2-5)"
Write-Host "Branch: feat/flame-wrap-complete (photo planes + Flame Wrap finale)"
Write-Host "Step 1 (Git + Node.js) must be done manually."

$git = Get-CommandPath "git"
$node = Get-CommandPath "node"
$npm = Get-NpmCmd

if (-not $git) { Fail "Git not found. Install https://git-scm.com/downloads and open a new terminal." }
if (-not $node) { Fail "Node.js not found. Install LTS 18+ from https://nodejs.org/ and open a new terminal." }
if (-not $npm) { Fail "npm not found. Reinstall Node.js - npm is included." }

$nodeVersionRaw = (& node -v).Trim().TrimStart("v")
try {
  $nodeVersion = [version]$nodeVersionRaw
} catch {
  Fail "Could not parse Node.js version: $nodeVersionRaw"
}
if ($nodeVersion.Major -lt 18) {
  Fail "Node.js 18+ required. Current version is $nodeVersionRaw"
}

Write-Host "Git:  $(& git --version)"
Write-Host "Node: v$nodeVersionRaw"
Write-Host "npm:  $(& npm -v)"

$cwd = (Get-Location).Path
$root = $null

if (Test-ProjectRoot $cwd) {
  $root = $cwd
  Write-Step 2 "Using current project folder: $root"
} elseif ($TargetDir -and (Test-ProjectRoot $TargetDir)) {
  $root = (Resolve-Path $TargetDir).Path
  Write-Step 2 "Using -TargetDir project folder: $root"
} else {
  $dest = if ($TargetDir) { $TargetDir } else { Join-Path $cwd "atelier-velo" }
  if (Test-ProjectRoot $dest) {
    $root = (Resolve-Path $dest).Path
    Write-Step 2 "Found existing clone: $root"
  } else {
    if (Test-Path $dest) {
      $empty = -not (Get-ChildItem -Force $dest | Select-Object -First 1)
      if (-not $empty) {
        Fail "Folder $dest exists and is not an Atelier Velo project. Pass -TargetDir or remove it."
      }
    }
    Write-Step 2 "Cloning $RepoUrl -> $dest"
    & git clone --branch $Branch --single-branch $RepoUrl $dest
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Branch clone failed, trying full clone + checkout..." -ForegroundColor Yellow
      & git clone $RepoUrl $dest
      if ($LASTEXITCODE -ne 0) {
        Fail "git clone failed. Check GitHub access (SSH key or gh auth login)."
      }
    }
    $root = (Resolve-Path $dest).Path
  }
}

Set-Location $root

if (Test-Path (Join-Path $root ".git")) {
  Write-Step 3 "Checking out $Branch"
  & git fetch origin $Branch
  & git checkout $Branch
  if ($LASTEXITCODE -ne 0) {
    Fail "Could not check out $Branch"
  }
  & git pull --ff-only origin $Branch
  if ($LASTEXITCODE -ne 0) {
    Write-Host "git pull skipped; continuing with local $Branch." -ForegroundColor Yellow
  }
} else {
  Write-Host "No .git folder - skipping checkout. Fine for a copied tree." -ForegroundColor Yellow
}

if (-not (Test-Path (Join-Path $root "public\parts\catalog.json"))) {
  Fail "Missing public\parts\catalog.json. Incomplete project copy."
}

if (-not (Test-Path (Join-Path $root "src\flame-wrap.js"))) {
  Fail "Missing src\flame-wrap.js. This script expects feat/flame-wrap-complete, not the volume branch."
}

Write-Step 4 "Installing npm dependencies"
Invoke-Npm -ProjectRoot $root -NpmArgs @("install")

if ($RebuildParts) {
  Write-Host ""
  Write-Host "Rebuilding parts (-RebuildParts)" -ForegroundColor Cyan
  $python = Get-CommandPath "python"
  if (-not $python) { Fail "Python not found. -RebuildParts needs Python 3." }
  $partsScript = Join-Path $root "scripts\process_parts.py"
  $escaped = $root.Replace("\", "\\")
  $content = Get-Content -Raw -Encoding UTF8 $partsScript
  $updated = [regex]::Replace(
    $content,
    'ROOT = Path\(r"[^"]+"\)',
    "ROOT = Path(r`"$escaped`")"
  )
  if ($updated -eq $content) {
    Write-Host "ROOT line not found in process_parts.py - left unchanged." -ForegroundColor Yellow
  } else {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($partsScript, $updated, $utf8NoBom)
    Write-Host "ROOT in process_parts.py -> $root"
  }
  & python -m pip install numpy Pillow scipy
  if ($LASTEXITCODE -ne 0) { Fail "Failed to install numpy / Pillow / scipy" }
  Invoke-Npm -ProjectRoot $root -NpmArgs @("run", "parts")
}

if ($NoDev) {
  Write-Host ""
  Write-Host "Done. Next: cd `"$root`"; npm run dev" -ForegroundColor Green
  Write-Host "Flame Wrap appears ~2.2s after the last part lands (or after a snap preset)."
  exit 0
}

Write-Step 5 "Starting Vite and opening the Flame Wrap preset"

if (Test-HttpOk $DevUrl) {
  Write-Host "Port $Port already responds - not starting a second Vite."
  if (-not $NoBrowser) {
    Start-Process $PresetUrl
  }
  Write-Host "Opened: $PresetUrl"
  Write-Host "Flame Wrap ramps in for ~2.2s. There is no orbit camera on this branch."
  exit 0
}

$npmCmd = Get-NpmCmd
$dev = Start-Process -FilePath $npmCmd -ArgumentList "run dev" -WorkingDirectory $root -PassThru -NoNewWindow

$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
  if ($dev.HasExited) {
    Fail "npm run dev exited early (code $($dev.ExitCode)). Check the Vite log above."
  }
  if (Test-HttpOk $DevUrl) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Fail "Server did not answer $DevUrl within 60s. Check that port $Port is free."
}

if (-not $NoBrowser) {
  Start-Process $PresetUrl
}

Write-Host ""
Write-Host "Server ready: $DevUrl" -ForegroundColor Green
Write-Host "Preset:      $PresetUrl"
Write-Host "Flame Wrap:  ramps in for ~2.2s under the finished bike. Reset fades it in ~0.75s."
Write-Host "Stop:        Ctrl+C in this window."
Write-Host ""

Wait-Process -Id $dev.Id
