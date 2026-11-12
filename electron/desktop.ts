import { execFile } from "node:child_process";

export type DesktopAction =
  | { action: "inspect"; window?: number | undefined }
  | { action: "launch"; app: string }
  | { action: "click" | "type"; window: number; element: string; text?: string }
  | { action: "key"; window: number; key: string };

export function validateAction(value: unknown): DesktopAction {
  if (!value || typeof value !== "object") throw new Error("Invalid desktop action.");
  const a = value as Record<string, unknown>;
  if (a.action === "inspect" && (a.window === undefined || (Number.isSafeInteger(a.window) && (a.window as number) >= 0))) return { action: "inspect", window: a.window as number | undefined };
  if (a.action === "launch" && typeof a.app === "string" && ["notepad", "calculator", "explorer"].includes(a.app))
    return { action: "launch", app: a.app };
  if (!Number.isSafeInteger(a.window) || (a.window as number) <= 0) throw new Error("Inspect the target window first.");
  if (a.action === "key" && typeof a.key === "string" && ["ENTER", "TAB", "ESC", "UP", "DOWN", "LEFT", "RIGHT", "CTRL+A", "CTRL+C", "CTRL+V", "CTRL+S"].includes(a.key))
    return { action: "key", window: a.window as number, key: a.key };
  if ((a.action === "click" || a.action === "type") && typeof a.element === "string" && /^-?\d+(,-?\d+)*$/.test(a.element) && a.element.length < 200) {
    if (a.action === "type" && (typeof a.text !== "string" || a.text.length > 10000)) throw new Error("Text must be at most 10,000 characters.");
    return { action: a.action, window: a.window as number, element: a.element, ...(a.action === "type" ? { text: a.text as string } : {}) };
  }
  throw new Error("Unsupported desktop action.");
}

// The script is fixed. Model arguments are JSON data, never interpolated PowerShell.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class AxiomWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
}
'@
$a = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:AXIOM_DESKTOP_ACTION)) | ConvertFrom-Json
if ($a.action -eq 'launch') {
  $apps = @{ notepad='notepad.exe'; calculator='calc.exe'; explorer='explorer.exe' }
  Start-Process -FilePath $apps[$a.app] | Out-Null
  @{status='launched'; app=$a.app} | ConvertTo-Json -Compress
  exit
}
if ($a.action -eq 'inspect' -and !$a.window) {
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  $items = @()
  foreach ($w in $windows) { try { if ($w.Current.NativeWindowHandle -gt 0 -and !$w.Current.IsOffscreen) { $items += @{window=$w.Current.NativeWindowHandle; title=$w.Current.Name} } } catch {} }
  @{windows=$items} | ConvertTo-Json -Depth 4 -Compress
  exit
}
$handle = [IntPtr]::new([long]$a.window)
$root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
$nodes = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
if ($a.action -eq 'inspect') {
  $items = @()
  for ($i=0; $i -lt [Math]::Min($nodes.Count, 1500); $i++) {
    $e=$nodes.Item($i)
    try {
      $c=$e.Current
      if ($c.IsOffscreen -or $c.IsPassword) { continue }
      $items += @{id=($e.GetRuntimeId() -join ','); name=$c.Name; type=$c.ControlType.ProgrammaticName; enabled=$c.IsEnabled}
      if ($items.Count -ge 150) { break }
    } catch {}
  }
  @{window=$handle.ToInt64(); title=$root.Current.Name; elements=$items; truncated=($nodes.Count -gt $items.Count)} | ConvertTo-Json -Depth 5 -Compress
  exit
}
if (![AxiomWindow]::SetForegroundWindow($handle)) { throw 'Could not focus the target window. Focus it manually and retry.' }
if ($a.action -eq 'key') {
  $keys=@{ ENTER='{ENTER}'; TAB='{TAB}'; ESC='{ESC}'; UP='{UP}'; DOWN='{DOWN}'; LEFT='{LEFT}'; RIGHT='{RIGHT}'; 'CTRL+A'='^a'; 'CTRL+C'='^c'; 'CTRL+V'='^v'; 'CTRL+S'='^s' }
  if ([AxiomWindow]::GetForegroundWindow().ToInt64() -ne $a.window) { throw 'Foreground changed.' }
  [System.Windows.Forms.SendKeys]::SendWait($keys[$a.key])
} else {
  $target=$null
  foreach ($e in $nodes) { if (($e.GetRuntimeId() -join ',') -eq $a.element) { $target=$e; break } }
  if ($null -eq $target) { throw 'Control no longer exists. Inspect again.' }
  if ($target.Current.IsPassword -or !$target.Current.IsEnabled -or $target.Current.IsOffscreen) { throw 'Control is unavailable or protected.' }
  if ([AxiomWindow]::GetForegroundWindow().ToInt64() -ne $a.window) { throw 'Foreground changed.' }
  if ($a.action -eq 'click') {
    $pattern=$target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
  } else {
    $pattern=$target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($pattern.Current.IsReadOnly) { throw 'Control is read-only.' }
    $pattern.SetValue($a.text)
  }
}
@{status='completed'; action=$a.action} | ConvertTo-Json -Compress
`;

export function desktopAction(value: unknown): Promise<string> {
  const action = validateAction(value);
  if (process.platform !== "win32") return Promise.reject(new Error("Computer controls currently require Windows."));
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(SCRIPT, "utf16le").toString("base64")], {
      windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
      env: { ...process.env, AXIOM_DESKTOP_ACTION: Buffer.from(JSON.stringify(action)).toString("base64") },
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}
