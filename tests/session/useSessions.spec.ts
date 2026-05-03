import {describe, it, expect, beforeEach} from 'vitest';

import {EXPERIMENTS} from '../../src/session/types';
import {useSessions} from '../../src/session/useSessions';

describe('useSessions', () => {
    beforeEach(() => {
        useSessions().reset();
    });

    it('starts every experiment in the idle state', () => {
        const {states} = useSessions();
        for (const exp of EXPERIMENTS) {
            expect(states.value[exp.id]).toBe('idle');
        }
    });

    it('starts with empty buffers, empty recency, and no active experiment', () => {
        const {buffers, recency, activeExperiment} = useSessions();
        for (const exp of EXPERIMENTS) {
            expect(buffers.value[exp.id]).toStrictEqual([]);
        }
        expect(recency.value).toStrictEqual([]);
        expect(activeExperiment.value).toBeNull();
    });

    it('setState updates a single experiment without disturbing siblings', () => {
        const {states, setState} = useSessions();
        setState('crucible', 'working');
        expect(states.value.crucible).toBe('working');
        expect(states.value.gatekeeper).toBe('idle');
    });

    it("appendOutput pushes lines onto the experiment's ring buffer", () => {
        const {buffers, appendOutput} = useSessions();
        appendOutput('crucible', 'first');
        appendOutput('crucible', 'second');
        expect(buffers.value.crucible).toStrictEqual(['first', 'second']);
        expect(buffers.value.gatekeeper).toStrictEqual([]);
    });

    it('appendOutput trims the buffer to the last 200 lines', () => {
        const {buffers, appendOutput} = useSessions();
        for (let i = 0; i < 250; i++) {
            appendOutput('crucible', `line ${i}`);
        }
        expect(buffers.value.crucible).toHaveLength(200);
        expect(buffers.value.crucible[0]).toBe('line 50');
        expect(buffers.value.crucible[199]).toBe('line 249');
    });

    it('touch appends to recency for first-time touches', () => {
        const {recency, touch} = useSessions();
        touch('crucible');
        touch('gatekeeper');
        expect(recency.value).toStrictEqual(['crucible', 'gatekeeper']);
    });

    it('touch moves an already-touched experiment to the end', () => {
        const {recency, touch} = useSessions();
        touch('crucible');
        touch('gatekeeper');
        touch('crucible');
        expect(recency.value).toStrictEqual(['gatekeeper', 'crucible']);
    });

    it('focus sets the active experiment', () => {
        const {activeExperiment, focus} = useSessions();
        focus('parlour');
        expect(activeExperiment.value).toBe('parlour');
        focus('horadrim');
        expect(activeExperiment.value).toBe('horadrim');
    });

    it('reset clears all state', () => {
        const sessions = useSessions();
        sessions.setState('crucible', 'working');
        sessions.appendOutput('crucible', 'hello');
        sessions.touch('crucible');
        sessions.focus('crucible');

        sessions.reset();

        expect(sessions.states.value.crucible).toBe('idle');
        expect(sessions.buffers.value.crucible).toStrictEqual([]);
        expect(sessions.recency.value).toStrictEqual([]);
        expect(sessions.activeExperiment.value).toBeNull();
    });

    it('returns the same singleton state across calls', () => {
        useSessions().focus('smokestacks');
        expect(useSessions().activeExperiment.value).toBe('smokestacks');
    });

    describe('appendChunk', () => {
        it('splits a chunk on newlines and pushes complete lines', () => {
            const {buffers, appendChunk} = useSessions();
            appendChunk('crucible', 'first\nsecond\nthird\n');
            expect(buffers.value.crucible).toStrictEqual(['first', 'second', 'third']);
        });

        it('holds a partial trailing line until the next chunk completes it', () => {
            const {buffers, appendChunk} = useSessions();
            appendChunk('crucible', 'first\nseco');
            expect(buffers.value.crucible).toStrictEqual(['first']);
            appendChunk('crucible', 'nd\nthird\n');
            expect(buffers.value.crucible).toStrictEqual(['first', 'second', 'third']);
        });

        it('normalizes CRLF into a single newline and treats stray CR as cursor-reset', () => {
            // `\r` alone is a cursor-reset in terminal streams (used by progress
            // bars), not a newline. The bench strips lone CRs and only treats
            // LF / CRLF as line terminators.
            const {buffers, appendChunk} = useSessions();
            appendChunk('crucible', 'one\r\ntwo\rredraw\n');
            expect(buffers.value.crucible).toStrictEqual(['one', 'tworedraw']);
        });

        it('chunked input that crosses the ring buffer cap respects the 200-line cap', () => {
            const {buffers, appendChunk} = useSessions();
            const lines: string[] = [];
            for (let i = 0; i < 250; i += 1) {
                lines.push(`line ${i}`);
            }
            appendChunk('crucible', `${lines.join('\n')}\n`);
            expect(buffers.value.crucible).toHaveLength(200);
            expect(buffers.value.crucible[0]).toBe('line 50');
            expect(buffers.value.crucible[199]).toBe('line 249');
        });

        it('leaves siblings untouched', () => {
            const {buffers, appendChunk} = useSessions();
            appendChunk('crucible', 'only crucible\n');
            expect(buffers.value.gatekeeper).toStrictEqual([]);
        });
    });
});
