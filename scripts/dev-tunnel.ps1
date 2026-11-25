<#
.SYNOPSIS
    Starts an HTTPS tunnel to the local Vite dev server (localhost:5173) using cloudflared or ngrok.

.DESCRIPTION
    This script checks for available tunneling tools (cloudflared or ngrok) in PATH
    and starts a tunnel to expose the local development server for mobile device testing.

.NOTES
    Requires either cloudflared or ngrok to be installed and available in PATH.
    - cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    - ngrok: https://ngrok.com/download
#>

param()

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERR]  $Message" -ForegroundColor Red
}

function Test-CommandAvailable {
    param([string]$Command)
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Start-CloudflaredTunnel {
    Write-Info "Starting cloudflared tunnel to http://localhost:5173..."
    Write-Info "The HTTPS URL will appear below. Press Ctrl+C to stop the tunnel."
    Write-Host ""
    & cloudflared tunnel --url http://localhost:5173
}

function Start-NgrokTunnel {
    Write-Info "Starting ngrok tunnel to port 5173..."
    Write-Info "The HTTPS URL will appear in the ngrok dashboard. Press Ctrl+C to stop the tunnel."
    Write-Host ""
    & ngrok http 5173
}

# Main execution
Write-Host "=== Regex Dev Tunnel ===" -ForegroundColor Magenta
Write-Host ""

# Check for cloudflared first (preferred - no auth required for quick tunnels)
if (Test-CommandAvailable "cloudflared") {
    Write-Success "Found cloudflared in PATH"
    Start-CloudflaredTunnel
}
elseif (Test-CommandAvailable "ngrok") {
    Write-Success "Found ngrok in PATH"
    Start-NgrokTunnel
}
else {
    Write-ErrorMsg "Neither 'cloudflared' nor 'ngrok' found in PATH."
    Write-Host ""
    Write-Host "Install one of the following to use HTTPS tunneling:"
    Write-Host "  - cloudflared (recommended, no account needed): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    Write-Host "  - ngrok (requires free account): https://ngrok.com/download"
    Write-Host ""
    Write-Host "After installation, restart your terminal and run this script again."
    exit 1
}