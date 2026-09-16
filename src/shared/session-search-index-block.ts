// Why: the session search index copies every agent transcript into a SQLite file under the data
// root, unredacted (src/main/ai-vault-search/session-search-schema.ts). Until the corporate review
// settles how long that copy may live and how it is deleted, this build never builds one, whatever
// the setting says. A removal and not a policy switch: no machine, and no settings file edit, can
// turn it back on.
//
// Two gates, because upstream is still reshaping these settings. `resolveAiVaultSearchSettings`
// reports the index off wherever a setting is read or written (desktop, headless serve, orcad),
// and `SessionSearchInstance.construct` — the only place an indexer or its database is created —
// refuses even a caller that hands it settings without going through that resolver.

// Annotated `boolean` rather than left as the literal `true` so the upstream bodies behind these
// gates stay reachable to the type checker.
export const SESSION_SEARCH_INDEX_BLOCKED: boolean = true
