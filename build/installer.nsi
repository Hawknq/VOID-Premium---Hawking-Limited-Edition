; VOID Premium kurulum betiği (NSIS). Windows'ta ve Linux'ta (makensis) derlenebilir.
; Kullanım: makensis -DVERSION=1.5.0 -DSRC=dist\win-unpacked -DOUT=dist\VOID-Premium-Setup-1.5.0.exe build\installer.nsi
Unicode true
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SRC
  !define SRC "dist\win-unpacked"
!endif
!ifndef OUT
  !define OUT "VOID-Premium-Setup.exe"
!endif

!define APPNAME "VOID Premium"
!define EXE "VOID Premium.exe"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VOIDClipper"

Name "${APPNAME}"
OutFile "${OUT}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\VOID Premium"
InstallDirRegKey HKCU "Software\VOIDClipper" "InstallDir"
SetCompressor /SOLID lzma
BrandingText "VOID Premium ${VERSION}"

!include "MUI2.nsh"
!define MUI_ICON "icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "installer-side.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "installer-side.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "installer-header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "VOID Premium'u şimdi aç"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Turkish"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} kurulumu"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "VOID Premium"
VIAddVersionKey "LegalCopyright" "VOID Premium"

Section "Install"
  ; Açık olan uygulamayı kapat (dosyalar kilitli kalmasın)
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  nsExec::Exec 'taskkill /F /IM "VOID Clipper.exe"'
  Sleep 800
  ; Eski adla (VOID Clipper) kurulmuş sürümün kalıntılarını temizle
  Delete "$INSTDIR\VOID Clipper.exe"
  Delete "$DESKTOP\VOID Clipper.lnk"
  RMDir /r "$SMPROGRAMS\VOID Clipper"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "VOID Clipper"
  SetOutPath "$INSTDIR"
  File "icon.ico"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\Kaldır.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"

  WriteRegStr HKCU "Software\VOIDClipper" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "VOID Premium"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 500
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  ; Windows ile başlat ayarı açıksa kaydı da temizle
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APPNAME}"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\VOIDClipper"
  RMDir /r "$INSTDIR"
SectionEnd
