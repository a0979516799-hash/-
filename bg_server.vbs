Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = baseDir
cmd = "cmd /c netstat -ano | findstr "":3000 "" | findstr ""LISTENING"" >nul || node server/index.js"
WshShell.Run cmd, 0, False
