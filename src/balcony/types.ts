// Balcony types — mirror `src-tauri/src/balcony/*` serde shapes.
//
// Keep these in lockstep with the Rust side. When a struct field renames
// or moves in `signs.rs` / `briefing_library.rs`, the matching field here
// must follow. Tests assert on field names so drift surfaces fast.

export interface LastChaosSign {
    reportNumber: number | null;
    label: string;
    score: string | null;
    raw: string;
}

export interface IdeaLedgerSign {
    candidateCount: number;
    shelvedCount: number;
    mostRecentDelivered: string | null;
}

export interface BalconySigns {
    lastChaos: LastChaosSign;
    ideaLedger: IdeaLedgerSign;
}

export const EMPTY_LAST_CHAOS: LastChaosSign = {reportNumber: null, label: '', score: null, raw: ''};

export const EMPTY_IDEA_LEDGER: IdeaLedgerSign = {candidateCount: 0, shelvedCount: 0, mostRecentDelivered: null};

export const EMPTY_BALCONY_SIGNS: BalconySigns = {lastChaos: EMPTY_LAST_CHAOS, ideaLedger: EMPTY_IDEA_LEDGER};

export type BriefingTargetShape = 'lab-wide' | 'per-experiment';

export interface BriefingTemplate {
    id: string;
    label: string;
    description: string;
    targetShape: BriefingTargetShape;
    openingPrompt: string;
}
