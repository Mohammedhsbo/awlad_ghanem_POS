!include LogicLib.nsh

!macro customInstall
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != 1
    File /oname=$PLUGINSDIR\VC_redist.x64.exe "${PROJECT_DIR}\..\resources\VC_redist.x64.exe"
    ExecWait '"$PLUGINSDIR\VC_redist.x64.exe" /install /quiet /norestart' $1
    ${If} $1 != 0
      Abort "Microsoft Visual C++ Redistributable installation failed."
    ${EndIf}
  ${EndIf}
!macroend