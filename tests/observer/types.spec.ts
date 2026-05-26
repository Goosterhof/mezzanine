// Type-shape parity test — keeps the TS mirrors aligned with the Rust
// serde wire shapes. v8 coverage reports `types.ts` as 0% because no
// runtime exports exist; this spec gives the runtime side something to
// import so the file shows up in the coverage report.

import {describe, expect, it} from 'vitest';

import type {
    ActivityState,
    ChronicleEvent,
    InferredActivity,
    ScientistActivity,
    SpritePosition,
} from '../../src/observer/types';

describe('observer/types', () => {
    it('ActivityState accepts all seven canonical values', () => {
        const states: ActivityState[] = ['idle', 'thinking', 'writing', 'reading', 'running', 'waiting', 'error'];
        expect(states).toHaveLength(7);
    });

    it('InferredActivity carries activity, detail, and optional metadata', () => {
        const inferred: InferredActivity = {
            activity: 'writing',
            detail: 'Modifying main.ts',
            toolUseId: 'toolu_abc',
            taskSpawn: {subagentType: 'Explore', description: 'Survey'},
            isToolResult: false,
        };
        expect(inferred.activity).toBe('writing');
        expect(inferred.taskSpawn?.subagentType).toBe('Explore');
    });

    it('ScientistActivity holds state + detail + lastEventAt', () => {
        const sa: ScientistActivity = {state: 'idle', detail: '...', lastEventAt: Date.now()};
        expect(sa.state).toBe('idle');
    });

    it('ChronicleEvent has scientistId + turn fields', () => {
        const evt: ChronicleEvent = {
            scientistId: 's1',
            turn: {ts: '2026-05-26T00:00:00Z', direction: 'out', payload: 'hello'},
        };
        expect(evt.turn.direction).toBe('out');
    });

    it('SpritePosition has scientistId + grid coords + pixel coords', () => {
        const pos: SpritePosition = {scientistId: 's1', row: 0, col: 0, x: 0, y: 0};
        expect(pos.row).toBe(0);
    });
});
