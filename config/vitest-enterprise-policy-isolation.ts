// Why: a corporate machine ships a machine-wide enterprise policy file (see
// src/main/enterprise/enterprise-policy-file.ts). Without neutralizing it here,
// the whole suite would run under lockdown on exactly the machines that build
// this fork, and ~100 upstream cases would fail for reasons no diff explains.
// Individual tests opt back in with vi.stubEnv(ENTERPRISE_POLICY_PATH_ENV, ...).
process.env.ORCA_ENTERPRISE_POLICY = 'off'

// `gh`'s own variable feeds the GHES host fallback; a build machine that has it
// set must not change how upstream provider tests classify their fixture hosts.
delete process.env.GH_HOST

// Same reason, for gh's own config: `githubEnterpriseHost` now falls back to the single host
// gh is logged in to (src/main/github/gh-config-host.ts). A developer logged in only to
// github.com would otherwise resolve a non-null host and silently change how upstream
// provider tests classify their fixture hosts. Point gh at a directory that cannot exist.
process.env.GH_CONFIG_DIR = '/nonexistent-orca-test-gh-config'
delete process.env.XDG_CONFIG_HOME
