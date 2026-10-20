; Fork: seed %ProgramData%\Orca\enterprise-policy.json on install when it is absent.
;
; Why only when absent: that file outranks the bundled policy and may already hold an
; administrator's or user's edits, so neither an install nor an update may rewrite it.
; CopyFileW with bFailIfExists makes "absent" and "write" one call, and it never raises UI —
; unlike `File`, whose write-error prompt would stall a silent install on a machine whose
; ProgramData ACL refuses standard users. A refused write leaves the bundled policy in charge.
;
; The content is enterprise-policy.machine-seed.json beside this file; its test proves that,
; under the bundled floor, it resolves to the same policy as the bundled file alone.

!define ORCA_ENTERPRISE_POLICY_SEED "${__FILEDIR__}\enterprise-policy.machine-seed.json"

!macro ORCA_SEED_MACHINE_ENTERPRISE_POLICY
  Push $0
  Push $1
  ; The same variable the app resolves the machine-wide path from (enterprise-policy-file.ts).
  ReadEnvStr $0 PROGRAMDATA
  ${if} $0 != ""
    InitPluginsDir
    File "/oname=$PLUGINSDIR\orca-enterprise-policy-seed.json" "${ORCA_ENTERPRISE_POLICY_SEED}"
    CreateDirectory "$0\Orca"
    System::Call 'kernel32::CopyFileW(w "$PLUGINSDIR\orca-enterprise-policy-seed.json", w "$0\Orca\enterprise-policy.json", i 1) i .r1'
    ClearErrors
  ${endIf}
  Pop $1
  Pop $0
!macroend
