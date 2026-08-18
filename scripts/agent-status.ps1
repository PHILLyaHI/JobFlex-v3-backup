<#
.SYNOPSIS
  Show what background Claude Code subagents are doing, and whether they have finished.

.DESCRIPTION
  Reads the current session transcript (~/.claude/projects/<project>/<session>.jsonl),
  pairs every Agent tool call with its completion notification, and prints a colored
  one-line-per-agent status board.

.PARAMETER Watch
  Refresh every -Interval seconds until Ctrl+C.

.PARAMETER Interval
  Seconds between refreshes in -Watch mode. Default 5.

.PARAMETER Session
  Path to a specific session .jsonl. Defaults to the most recently written one
  for this project.

.EXAMPLE
  .\scripts\agent-status.ps1
  .\scripts\agent-status.ps1 -Watch
#>

[CmdletBinding()]
param(
    [switch]$Watch,
    [int]$Interval = 5,
    [string]$Session,
    [switch]$All
)

$ErrorActionPreference = 'Stop'

function Get-SessionFile {
    param([string]$Explicit)

    if ($Explicit) {
        if (-not (Test-Path $Explicit)) { throw "Session file not found: $Explicit" }
        return (Resolve-Path $Explicit).Path
    }

    # Claude Code slugifies the project path: c:\joblfex-v3 -> c--joblfex-v3
    $slug = (Get-Location).Path -replace '[:\\/]', '-'
    $dir = Join-Path $env:USERPROFILE ".claude\projects\$slug"

    if (-not (Test-Path $dir)) {
        # fall back to whichever project dir was touched most recently
        $root = Join-Path $env:USERPROFILE '.claude\projects'
        if (-not (Test-Path $root)) { throw "No Claude projects directory at $root" }
        $dir = (Get-ChildItem $root -Directory | Sort-Object LastWriteTime -Descending |
                Select-Object -First 1).FullName
    }

    # Claude Code exports the live session id. Several sessions can share one
    # working tree, so this is the only unambiguous way to find our own.
    if ($env:CLAUDE_CODE_SESSION_ID) {
        $mine = Join-Path $dir ($env:CLAUDE_CODE_SESSION_ID + '.jsonl')
        if (Test-Path $mine) { return $mine }
    }

    $candidates = Get-ChildItem $dir -Filter *.jsonl |
                  Sort-Object LastWriteTime -Descending |
                  Select-Object -First 8

    if (-not $candidates) { throw "No session transcript found in $dir" }

    # Several sessions can share one working tree. Prefer the transcript that
    # launched an Agent most recently, not merely the file touched most recently.
    $best = $null
    $bestAt = [datetime]::MinValue

    foreach ($c in $candidates) {
        $tmp = Join-Path $env:TEMP ("agent-scan-" + [System.IO.Path]::GetRandomFileName() + ".jsonl")
        Copy-Item $c.FullName $tmp -Force
        try {
            foreach ($line in (Get-Content $tmp -Encoding UTF8)) {
                if ($line -notlike '*"name":"Agent"*') { continue }
                try { $entry = $line | ConvertFrom-Json } catch { continue }
                $at = [datetime]$entry.timestamp
                if ($at -gt $bestAt) { $bestAt = $at; $best = $c }
            }
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not $best) { $best = $candidates[0] }

    $script:OtherSessions = @($candidates | Where-Object { $_.FullName -ne $best.FullName }).Count
    return $best.FullName
}

function Get-AgentRecords {
    param([string]$Path)

    # Copy first: the live session file is held open by Claude Code.
    $tmp = Join-Path $env:TEMP ("agent-status-" + [System.IO.Path]::GetRandomFileName() + ".jsonl")
    Copy-Item $Path $tmp -Force
    try {
        $lines = Get-Content $tmp -Encoding UTF8
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }

    $agents = [ordered]@{}   # toolUseId -> record
    $byAgentId = @{}         # agentId   -> record

    foreach ($line in $lines) {
        if (-not $line) { continue }

        try { $entry = $line | ConvertFrom-Json } catch { continue }
        $content = $entry.message.content
        if (-not $content) { continue }

        foreach ($block in $content) {

            # 1. The launch: an Agent tool call carries the human-readable description.
            if ($block.type -eq 'tool_use' -and $block.name -eq 'Agent') {
                $agents[$block.id] = [pscustomobject]@{
                    ToolUseId = $block.id
                    AgentId   = $null
                    Label     = $block.input.description
                    Model     = $block.input.model
                    Type      = $block.input.subagent_type
                    Started   = [datetime]$entry.timestamp
                    Finished  = $null
                    Status    = 'RUNNING'
                }
            }

            # 2. The launch acknowledgement carries the agentId the notification will use.
            if ($block.type -eq 'tool_result' -and $agents.Contains($block.tool_use_id)) {
                $text = if ($block.content -is [string]) { $block.content }
                        else { ($block.content | ForEach-Object { $_.text }) -join "`n" }

                if ($text -match 'agentId:\s*([0-9a-f]+)') {
                    $rec = $agents[$block.tool_use_id]
                    $rec.AgentId = $Matches[1]
                    $byAgentId[$Matches[1]] = $rec
                }
            }

            # 3. The completion notification arrives as a text block naming the task-id.
            if ($block.type -eq 'text' -and $block.text -match '<task-id>([0-9a-f]+)</task-id>') {
                $id = $Matches[1]
                if ($byAgentId.ContainsKey($id)) {
                    $rec = $byAgentId[$id]
                    $rec.Finished = [datetime]$entry.timestamp
                    $rec.Status = if ($block.text -match '<status>completed</status>') { 'DONE' }
                                  else { 'STOPPED' }
                }
            }
        }
    }

    # Notifications also land as plain user-message strings; catch those too.
    foreach ($line in $lines) {
        if ($line -notmatch '<task-id>([0-9a-f]+)</task-id>') { continue }
        $id = $Matches[1]
        if (-not $byAgentId.ContainsKey($id)) { continue }

        $rec = $byAgentId[$id]
        if ($rec.Status -ne 'RUNNING') { continue }

        try { $entry = $line | ConvertFrom-Json } catch { continue }
        $rec.Finished = [datetime]$entry.timestamp
        $rec.Status = if ($line -match '<status>completed</status>') { 'DONE' } else { 'STOPPED' }
    }

    return @($agents.Values)
}

function Format-Span {
    param([timespan]$Span)

    if ($Span.TotalHours -ge 1) { return ('{0}h{1:00}m' -f [int]$Span.TotalHours, $Span.Minutes) }
    if ($Span.TotalMinutes -ge 1) { return ('{0}m{1:00}s' -f [int]$Span.TotalMinutes, $Span.Seconds) }
    return ('{0}s' -f [int]$Span.TotalSeconds)
}

function Get-SessionFiles {
    <#
      Every session transcript for this project that launched at least one agent,
      newest first. Used by -All so parallel chats can be seen side by side.
    #>
    $slug = (Get-Location).Path -replace '[:\\/]', '-'
    $dir = Join-Path $env:USERPROFILE ".claude\projects\$slug"
    if (-not (Test-Path $dir)) { return @() }

    $found = @()
    foreach ($c in (Get-ChildItem $dir -Filter *.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 12)) {
        $tmp = Join-Path $env:TEMP ("agent-scan-" + [System.IO.Path]::GetRandomFileName() + ".jsonl")
        Copy-Item $c.FullName $tmp -Force
        try {
            if (Select-String -Path $tmp -Pattern '"name":"Agent"' -SimpleMatch -Quiet) {
                $found += $c.FullName
            }
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }
    return $found
}

function Show-Board {
    param([string]$Path)

    $records = Get-AgentRecords -Path $Path
    $now = Get-Date

    $id = [System.IO.Path]::GetFileNameWithoutExtension($Path)
    $isMine = ($env:CLAUDE_CODE_SESSION_ID -and $id -eq $env:CLAUDE_CODE_SESSION_ID)

    Write-Host ''
    if ($isMine) {
        Write-Host '  THIS CHAT  ' -ForegroundColor Black -BackgroundColor Cyan -NoNewline
    } else {
        Write-Host '  OTHER CHAT  ' -ForegroundColor Black -BackgroundColor DarkYellow -NoNewline
    }
    Write-Host ('  {0}  ' -f $id.Substring(0, 8)) -ForegroundColor DarkGray -NoNewline
    Write-Host $now.ToString('HH:mm:ss') -ForegroundColor DarkGray
    Write-Host ''

    if (-not $records -or $records.Count -eq 0) {
        Write-Host '    no agents launched in this session' -ForegroundColor DarkGray
        Write-Host ''
        return
    }

    $width = ($records | ForEach-Object { $_.Label.Length } | Measure-Object -Maximum).Maximum
    if ($width -lt 24) { $width = 24 }

    foreach ($r in $records) {
        if ($r.Status -eq 'DONE') {
            $glyph = '*'; $color = 'Green'
            $span = $r.Finished - $r.Started
        } elseif ($r.Status -eq 'STOPPED') {
            $glyph = 'x'; $color = 'Red'
            $span = $r.Finished - $r.Started
        } else {
            $glyph = 'o'; $color = 'Yellow'
            $span = $now - $r.Started
        }

        Write-Host ('   {0} ' -f $glyph) -ForegroundColor $color -NoNewline
        Write-Host ($r.Label.PadRight($width + 3)) -ForegroundColor White -NoNewline
        Write-Host ($r.Status.PadRight(9)) -ForegroundColor $color -NoNewline
        Write-Host (Format-Span $span).PadLeft(7) -ForegroundColor DarkGray -NoNewline

        $model = $r.Model
        if (-not $model) { $model = 'inherit' }
        Write-Host ('   ' + $model) -ForegroundColor DarkGray
    }

    $done = @($records | Where-Object { $_.Status -eq 'DONE' }).Count
    $run  = @($records | Where-Object { $_.Status -eq 'RUNNING' }).Count
    $bad  = @($records | Where-Object { $_.Status -eq 'STOPPED' }).Count

    Write-Host ''
    Write-Host '   ' -NoNewline
    Write-Host "$done done" -ForegroundColor Green -NoNewline
    Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
    Write-Host "$run running" -ForegroundColor Yellow -NoNewline
    if ($bad -gt 0) {
        Write-Host ' | ' -ForegroundColor DarkGray -NoNewline
        Write-Host "$bad stopped" -ForegroundColor Red -NoNewline
    }
    Write-Host ''
    Write-Host ''
}

function Show-All {
    if ($All) {
        $files = Get-SessionFiles
        if (-not $files) { Write-Host '   no sessions with agents found' -ForegroundColor DarkGray; return }
        foreach ($f in $files) { Show-Board -Path $f }
    } else {
        Show-Board -Path $script:sessionFile
    }
}

if ($All) {
    $script:sessionFile = $null
} else {
    $script:sessionFile = Get-SessionFile -Explicit $Session
}

if ($Watch) {
    try {
        while ($true) {
            Clear-Host
            Show-All
            Write-Host ("   refreshing every {0}s - Ctrl+C to stop" -f $Interval) -ForegroundColor DarkGray
            Start-Sleep -Seconds $Interval
        }
    } catch [System.Management.Automation.PipelineStoppedException] {
        # Ctrl+C
    }
} else {
    Show-All
}
