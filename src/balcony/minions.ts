// The minion catalogue for the Dispatch sheet.
//
// "For now" (investor directive 2026-06-08) the Mezzanine dispatch is
// deliberately minimal: the investor picks one minion (or none) and the
// scientist is always sent into the lab root. Selecting a minion seeds the
// claude session's first prompt with `@agent-<slug>` — the deterministic
// Claude Code routing token that hands control straight to that subagent.
// "No minion" dispatches a plain claude session with no seeded prompt.
//
// Each entry's `slug` MUST match a real agent file at
// `.claude/agents/<slug>.md` (its `name:` frontmatter), or the
// `@agent-<slug>` token will not route. The deprecated
// `parliament-simulated` fallback is intentionally omitted.

export interface Minion {
    slug: string;
    label: string;
}

export const MINIONS: readonly Minion[] = [
    {slug: 'inspector', label: 'The Inspector'},
    {slug: 'synchronizer', label: 'The Synchronizer'},
    {slug: 'enhancement-squad', label: 'The Enhancement Squad'},
    {slug: 'scribe', label: 'The Scribe'},
    {slug: 'muse', label: 'The Muse'},
    {slug: 'chaos-monkey', label: 'The Chaos Monkey'},
    {slug: 'artisan', label: 'The Artisan'},
    {slug: 'illusionist', label: 'The Illusionist'},
    {slug: 'librarian', label: 'The Librarian'},
    {slug: 'archivist', label: 'The Archivist'},
    {slug: 'drill-sergeant', label: 'The Drill Sergeant'},
    {slug: 'task-master', label: 'The Task Master'},
    {slug: 'inheritance', label: 'The Inheritance'},
    {slug: 'surgeon', label: 'The Surgeon'},
    {slug: 'cross-pollinator', label: 'The Cross-Pollinator'},
    {slug: 'campaign', label: 'The Campaign'},
    {slug: 'delivery-seal', label: 'The Delivery Seal'},
    {slug: 'parliament', label: 'The Parliament'},
    {slug: 'ratifier', label: 'The Ratifier'},
] as const;

/** The opening prompt for a dispatch: the `@agent-<slug>` routing token for
 *  a selected minion, or '' for a plain session (no minion). The empty
 *  string tells the substrate to launch `claude` with no positional arg. */
export function missionForMinion(slug: string | null): string {
    return slug === null ? '' : `@agent-${slug}`;
}
