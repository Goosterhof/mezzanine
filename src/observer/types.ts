// Observer types — mirror the Rust serde shapes in src-tauri/src/chronicle/.
//
// `ActivityState` is the union of activity values the Pixel Lab inferred
// from agent transcripts; the Observer reuses the exact same vocabulary
// because the upstream JSONL shape is the same (Anthropic's claude
// emits the same turn shape regardless of which front-end consumes it).
//
// `ChronicleEvent` is the wire-shape of the Tauri `chronicle-event`
// payload that the per-scientist tail emits. The scientist_id field is
// the routing key — useObserver maintains a Map<ScientistId, ...> and
// fans events out by id.

import type {ChronicleTurn} from '../chronicle/types';
import type {ScientistId} from '../roster/types';

/** The seven activity states the lab floor's sprites can occupy. */
export type ActivityState = 'idle' | 'thinking' | 'writing' | 'reading' | 'running' | 'waiting' | 'error';

/** What `inferActivity` returns when it can read a turn — null when it cannot. */
export interface InferredActivity {
    activity: ActivityState;
    detail: string;
    toolUseId?: string;
    taskSpawn?: {subagentType: string; description: string};
    isToolResult?: boolean;
}

/** Per-scientist state carried by useObserver — the most recent inferred
 *  activity plus the timestamp of the last event for the idle timer. */
export interface ScientistActivity {
    state: ActivityState;
    detail: string;
    lastEventAt: number;
}

/** Wire shape of the Tauri `chronicle-event` payload. */
export interface ChronicleEvent {
    scientistId: ScientistId;
    turn: ChronicleTurn;
}

/** Sprite grid placement — one entry per Roster scientist on the floor. */
export interface SpritePosition {
    scientistId: ScientistId;
    row: number;
    col: number;
    /** Pixel coordinates relative to the canvas; the LabScene fills these
     *  in at layout time based on canvas dimensions. */
    x: number;
    y: number;
}
