// Why: a corporate machine ships a machine-wide enterprise policy file (see
// src/main/enterprise/enterprise-policy-file.ts). Without neutralizing it here,
// the whole suite would run under lockdown on exactly the machines that build
// this fork, and ~100 upstream cases would fail for reasons no diff explains.
// Individual tests opt back in with vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, ...).
process.env.ORCA_ENTERPRISE_POLICY = 'off'

// `gh`'s own variable feeds the GHES host fallback; a build machine that has it
// set must not change how upstream provider tests classify their fixture hosts.
delete process.env.GH_HOST
