; Modern UI's language dialog preselects the Windows display language.
; This copy of its MUI_LANGDLL_DISPLAY preselects English instead, and skips
; the dialog during passive installs such as in-app updates. The app reads
; the saved "Installer Language" value on first start.
!macroundef MUI_LANGDLL_DISPLAY
!macro MUI_LANGDLL_DISPLAY
  !verbose push
  !verbose ${MUI_VERBOSE}

  !insertmacro MUI_LANGDLL_VARIABLES
  !insertmacro MUI_DEFAULT MUI_LANGDLL_WINDOWTITLE "Installer Language"
  !insertmacro MUI_DEFAULT MUI_LANGDLL_INFO "Please select a language."

  StrCpy $LANGUAGE 1033
  ReadRegStr $mui.LangDLL.RegistryLanguage "${MUI_LANGDLL_REGISTRY_ROOT}" "${MUI_LANGDLL_REGISTRY_KEY}" "${MUI_LANGDLL_REGISTRY_VALUENAME}"
  ${If} $mui.LangDLL.RegistryLanguage != ""
    StrCpy $LANGUAGE $mui.LangDLL.RegistryLanguage
  ${ElseIfNot} ${Silent}
  ${AndIf} $PassiveMode != 1
    LangDLL::LangDialog "${MUI_LANGDLL_WINDOWTITLE}" "${MUI_LANGDLL_INFO}" A ${MUI_LANGDLL_LANGUAGES} ""
    Pop $LANGUAGE
    ${If} $LANGUAGE == "cancel"
      Abort
    ${EndIf}
  ${EndIf}

  !verbose pop
!macroend
