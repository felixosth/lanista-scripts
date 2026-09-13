<#
.SYNOPSIS
    Serves the docs/ folder over local HTTP so index.html can load lanista_items_detailed.json.

.DESCRIPTION
    Opening docs/index.html directly (file://) doesn't work in most browsers - they block
    fetch() requests from file: URLs, so the item data never loads. This starts a small
    static file server (no Node/Python required) and opens it in your default browser.

.PARAMETER Port
    Port to listen on. Defaults to 8080.

.PARAMETER NoBrowser
    Don't auto-open the default browser.

.EXAMPLE
    .\serve-docs.ps1
    .\serve-docs.ps1 -Port 3000
#>
param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root = Join-Path $PSScriptRoot 'docs'
if (-not (Test-Path $root)) {
    Write-Error "Could not find a docs folder next to this script (expected $root)"
    exit 1
}
$root = (Resolve-Path $root).Path

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.txt'  = 'text/plain; charset=utf-8'
    '.md'   = 'text/markdown; charset=utf-8'
}

$prefix = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Error "Couldn't start a server on $prefix - try a different -Port, or run this script as Administrator.`n$_"
    exit 1
}

Write-Host "Serving $root" -ForegroundColor Green
Write-Host "  -> $prefix  (Ctrl+C to stop)" -ForegroundColor Green

if (-not $NoBrowser) {
    Start-Process $prefix
}

# $listener.GetContext() below blocks the thread waiting for a request, and Ctrl+C alone
# can't interrupt a blocked synchronous .NET call like that - PowerShell only checks for it
# between script statements. Console.CancelKeyPress fires on its own thread even while the
# main thread is blocked, so calling Stop() there is what actually unblocks GetContext()
# (it throws HttpListenerException on the main thread, which the loop below catches to exit
# cleanly). Cancel = $true suppresses the default immediate-terminate behavior so this
# handler's Stop()/cleanup gets to run first.
#
# The handler CANNOT be a PowerShell scriptblock. .NET invokes CancelKeyPress on a brand
# new thread, and the main thread's runspace is busy (blocked inside GetContext()) - trying
# to run a PS scriptblock on a second thread in the same busy runspace throws (PowerShell
# can't run two things at once), and since that throw happens on a raw thread-pool thread
# with nothing to catch it, .NET's default response is to kill the whole process instantly,
# taking the terminal down with it. A compiled C# handler needs no runspace, so it's safe
# to invoke from any thread regardless of what the main thread is doing.
Add-Type -TypeDefinition @"
using System;
using System.Net;
public static class ServeDocsCtrlC
{
    public static volatile bool StopRequested = false;
    public static HttpListener Listener;
    public static void Handler(object sender, ConsoleCancelEventArgs e)
    {
        e.Cancel = true;
        StopRequested = true;
        try { if (Listener != null && Listener.IsListening) Listener.Stop(); } catch { }
    }
}
"@

[ServeDocsCtrlC]::Listener = $listener
# Add-Type only compiles a given type once per PowerShell process, so its static fields
# persist across repeated runs of this script in the same terminal session - without this
# reset, a prior run's Ctrl+C would leave StopRequested = true and the loop below would
# exit immediately on every subsequent run.
[ServeDocsCtrlC]::StopRequested = $false
# CancelKeyPress is a multicast event on the process, so re-running this script in the same
# session would otherwise stack up one subscription per run - remove any prior one first so
# there's always exactly one.
[Console]::remove_CancelKeyPress([ConsoleCancelEventHandler][ServeDocsCtrlC]::Handler)
[Console]::add_CancelKeyPress([ConsoleCancelEventHandler][ServeDocsCtrlC]::Handler)

try {
    while ($listener.IsListening -and -not [ServeDocsCtrlC]::StopRequested) {
        try {
            $context = $listener.GetContext()
        } catch [System.Net.HttpListenerException] {
            break
        } catch [ObjectDisposedException] {
            break
        }

        $request = $context.Request
        $response = $context.Response

        try {
            $relativePath = [Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = 'index.html'
            }

            $candidate = Join-Path $root $relativePath
            $resolved = $null
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                $resolved = (Resolve-Path -LiteralPath $candidate).Path
            }

            # Guard against path traversal (e.g. "../../secrets.txt") escaping the docs folder
            if ($resolved -and $resolved.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
                $ext = [IO.Path]::GetExtension($resolved).ToLowerInvariant()
                $contentType = $mimeTypes[$ext]
                if (-not $contentType) { $contentType = 'application/octet-stream' }

                $bytes = [IO.File]::ReadAllBytes($resolved)
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $notFound = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
                $response.ContentLength64 = $notFound.Length
                $response.OutputStream.Write($notFound, 0, $notFound.Length)
            }
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}

if ([ServeDocsCtrlC]::StopRequested) {
    Write-Host "`nStopping..." -ForegroundColor Yellow
}
Write-Host "Server stopped." -ForegroundColor Green
