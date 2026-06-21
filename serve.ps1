<#
  Minimal dependency-free static file server for local preview.
  Useful because this machine has no Python/Node to run `http.server`.

  Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8000]
  Then open http://localhost:8000
#>
param(
    [int]$Port = 8000,
    [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path

$contentTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.csv'  = 'text/csv; charset=utf-8'
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Serving $Root at http://localhost:$Port  (Ctrl+C to stop)"

function Send-Response($stream, [int]$code, [string]$status, [byte[]]$body, [string]$type) {
    $headers = "HTTP/1.0 $code $status`r`n" +
               "Content-Type: $type`r`n" +
               "Content-Length: $($body.Length)`r`n" +
               "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($body.Length) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        # Browsers open speculative connections they may not immediately use. A
        # blocking ReadLine on an idle one would wedge this single-threaded server,
        # so give the stream a read timeout and just drop connections that go quiet.
        $stream = $client.GetStream()
        $stream.ReadTimeout = 4000
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII)
        $requestLine = $reader.ReadLine()
        if (-not $requestLine) { $client.Close(); continue }

        $parts = $requestLine.Split(' ')
        $path = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
        $path = $path.Split('?')[0]
        $path = [System.Uri]::UnescapeDataString($path)
        if ($path -eq '/' -or $path.EndsWith('/')) { $path += 'index.html' }

        # Resolve against root and block path traversal.
        $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/'))))
        if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
            Send-Response $stream 403 'Forbidden' ([byte[]]@()) 'text/plain'
        }
        elseif (Test-Path $full -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            $type = if ($contentTypes.ContainsKey($ext)) { $contentTypes[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($full)
            Send-Response $stream 200 'OK' $bytes $type
            Write-Host "200 $path"
        }
        else {
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            Send-Response $stream 404 'Not Found' $body 'text/plain; charset=utf-8'
            Write-Host "404 $path"
        }
    }
    catch {
        Write-Host "error: $($_.Exception.Message)"
    }
    finally {
        $client.Close()
    }
}
