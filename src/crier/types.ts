// The Crier's Watch (#00060) — TS mirrors of the Rust serde shapes.
//
// These match the `crier::{CrierStatus, CrierQueueEntry, CrierWatchState}`
// types on the Rust side. `CrierStatus` is the kebab-case enum; the watch
// state and queue entry use camelCase (serde `rename_all = "camelCase"`).

import type {ScientistId} from '../roster/types';

/** The three balcony-voiced states — ON PATROL / STOOD DOWN / NO TOKEN. */
export type CrierStatus = 'armed' | 'idle' | 'token-missing';

/** One open review request pulled from the bus's `GET /open`. */
export interface CrierQueueEntry {
    id: number;
    prUrl: string;
    repo: string;
    reviewCount: number;
}

/** The combined watch state the panel reads on open + refresh. */
export interface CrierWatchState {
    status: CrierStatus;
    queue: CrierQueueEntry[];
    lastReadAt: string | null;
    busError: string | null;
    /** The live crier session id when armed — lets a panel that opened after
     *  the session was armed bind its watch glass to the real PTY instead of
     *  rendering ON PATROL over a dead terminal. `null` when not armed. */
    scientistId: ScientistId | null;
}

/** The Patrol Lamp's three rhythms — see PatrolLamp.vue + the Gift. */
export type PatrolLampStatus = 'nudging' | 'watching' | 'off';

/** The starting watch state before the first read lands. */
export const EMPTY_WATCH_STATE: CrierWatchState = {
    status: 'token-missing',
    queue: [],
    lastReadAt: null,
    busError: null,
    scientistId: null,
};

/** The crier scientist id type — the same uuid string the roster uses. */
export type CrierScientistId = ScientistId;
