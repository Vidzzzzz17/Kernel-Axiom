Unicode true
!include "MUI2.nsh"
!ifndef APP_DIR
  !error "Supply APP_DIR containing the packaged Windows application"
!endif
!ifndef OUTPUT
  !define OUTPUT "KernelAxiom-Setup-x64.exe"
!endif
Name "Kernel Axiom"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Kernel Axiom"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\Kernel Axiom.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\Kernel Axiom.lnk" "$INSTDIR\Kernel Axiom.exe"
  CreateDirectory "$SMPROGRAMS\Kernel Axiom"
  CreateShortcut "$SMPROGRAMS\Kernel Axiom\Kernel Axiom.lnk" "$INSTDIR\Kernel Axiom.exe"
  CreateShortcut "$SMPROGRAMS\Kernel Axiom\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KernelAxiom" "DisplayName" "Kernel Axiom"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KernelAxiom" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KernelAxiom" "DisplayVersion" "0.2.0"
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\Kernel Axiom.lnk"
  RMDir /r "$SMPROGRAMS\Kernel Axiom"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KernelAxiom"
SectionEnd