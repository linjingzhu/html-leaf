!include LogicLib.nsh

!define LEAF_UNINSTALL_FILENAME "Uninstall.exe"
!define LEAF_LEGACY_UNINSTALL_FILENAME "Uninstall ${PRODUCT_FILENAME}.exe"

!macro customHeader
  !ifdef UNINSTALL_FILENAME
    !undef UNINSTALL_FILENAME
  !endif
  !define UNINSTALL_FILENAME "${LEAF_UNINSTALL_FILENAME}"
!macroend

!macro customPageAfterChangeDir
  Function LeafReconcileExistingInstallPathPage
    ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $R0 != ""
      Abort
    ${EndIf}

    ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      Abort
    ${EndIf}
    ${IfNot} ${FileExists} "$INSTDIR\resources\app.asar"
      Abort
    ${EndIf}

    StrCpy $R1 ""
    ${If} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
      StrCpy $R1 "$INSTDIR\${UNINSTALL_FILENAME}"
    ${ElseIf} ${FileExists} "$INSTDIR\${LEAF_LEGACY_UNINSTALL_FILENAME}"
      StrCpy $R1 "$INSTDIR\${LEAF_LEGACY_UNINSTALL_FILENAME}"
    ${EndIf}

    ${If} $R1 == ""
      Abort
    ${EndIf}

    ${If} $installMode == "all"
      StrCpy $R2 "/allusers"
    ${Else}
      StrCpy $R2 "/currentuser"
    ${EndIf}

    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts "true"
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" ShortcutName "${SHORTCUT_NAME}"
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$R1" $R2'
    WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString '"$R1" $R2 /S'
    Abort
  FunctionEnd

  Page custom LeafReconcileExistingInstallPathPage
!macroend

!macro customInstall
  Delete "$INSTDIR\${LEAF_LEGACY_UNINSTALL_FILENAME}"
!macroend

!macro customRemoveFiles
  ${If} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"

    Push ""
    Call un.atomicRMDir
    Pop $R0

    ${If} $R0 != 0
      DetailPrint "File is busy, aborting: $R0"

      Push ""
      Call un.restoreFiles
      Pop $R0

      Abort `Can't rename "$INSTDIR" to "$PLUGINSDIR\old-install".`
    ${EndIf}
  ${EndIf}

  SetOutPath "$TEMP"
  Delete /REBOOTOK "$INSTDIR\${LEAF_LEGACY_UNINSTALL_FILENAME}"
  RMDir /r /REBOOTOK "$INSTDIR"
!macroend
