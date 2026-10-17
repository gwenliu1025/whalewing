param(
  [ValidateSet('menu', 'install', 'restore', 'status')][string]$Command = 'menu',
  [string]$DshDir,
  [string]$DshHome
)
# 找到 DeepSeek Harness 的安装目录，借用它自带的程序运行时执行安装脚本；本机不需要另装 Node。
# menu：交互菜单，按是否已安装让员工选择安装、升级或还原，结束时停住窗口。
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeName = 'DeepSeek Harness.exe'

function Find-Dsh {
  $keys = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  $found = Get-ItemProperty $keys -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'DeepSeek Harness*' -and $_.InstallLocation }
  foreach ($item in $found) { if (Test-Path -LiteralPath (Join-Path $item.InstallLocation $exeName)) { return $item.InstallLocation } }
  foreach ($dir in @("$env:LOCALAPPDATA\Programs\DeepSeek Harness", "$env:ProgramFiles\DeepSeek Harness")) {
    if (Test-Path -LiteralPath (Join-Path $dir $exeName)) { return $dir }
  }
  return $null
}

function Invoke-Installer([string]$Action) {
  if (-not $script:DshDir) { $script:DshDir = Find-Dsh }
  if (-not $script:DshDir) {
    Write-Host '  没有自动找到 DeepSeek Harness 的安装位置。'
    $script:DshDir = (Read-Host '  请粘贴安装目录（里面有 DeepSeek Harness.exe 的文件夹）').Trim('"', ' ')
  }
  $exe = Join-Path $script:DshDir $exeName
  if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "  没有完成：$($script:DshDir) 里没有 $exeName。请确认 DeepSeek Harness 已安装。"
    return 1
  }
  $arguments = @((Join-Path $here 'installer.mjs'), $Action, '--dsh', $script:DshDir)
  if ($DshHome) { $arguments += @('--home', $DshHome) }
  $env:ELECTRON_RUN_AS_NODE = '1'
  $env:ELECTRON_NO_ASAR = '1'
  # 管道让 PowerShell 等待这个图形程序以 Node 模式跑完，并按 UTF-8 显示中文输出。
  & $exe @arguments | Out-Host
  return $LASTEXITCODE
}

if ($Command -ne 'menu') { exit (Invoke-Installer $Command) }

$home_ = if ($DshHome) { $DshHome } elseif ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$installed = Test-Path -LiteralPath (Join-Path $home_ 'whalewing\install-state.json')
Write-Host ''
Write-Host '  鲸翼安装程序'
Write-Host '  ----------------'
Write-Host '  开始前请完全退出 DeepSeek Harness（包括右下角托盘图标）。'
Write-Host ''
if ($installed) {
  Write-Host '  这台电脑已经装过鲸翼。'
  Write-Host '    1  升级 / 重新安装'
  Write-Host '    2  还原（卸载鲸翼，DSH 回到安装前的状态）'
  Write-Host '    其他  退出'
  $choice = (Read-Host '  请输入数字后按回车').Trim()
  $action = @{ '1' = 'install'; '2' = 'restore' }[$choice]
} else {
  $choice = (Read-Host '  按回车开始安装，输入 Q 退出').Trim()
  $action = if ($choice -eq '' -or $choice -eq 'y' -or $choice -eq 'Y') { 'install' } else { $null }
}
if (-not $action) { Write-Host '  已退出，没有做任何改动。'; $code = 0 }
else { Write-Host ''; $code = Invoke-Installer $action }
Write-Host ''
Read-Host '  按回车关闭窗口' | Out-Null
exit $code
