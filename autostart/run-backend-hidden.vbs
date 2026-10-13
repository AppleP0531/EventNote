' EventNote backend launcher: runs run-backend.ps1 without showing a window.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\run-backend.ps1"""
CreateObject("WScript.Shell").Run cmd, 0, False
