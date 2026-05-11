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

    it('starts with empty recency and no active experiment', () => {
        const {recency, activeExperiment} = useSessions();
        expect(recency.value).toStrictEqual([]);
        expect(activeExperiment.value).toBeNull();
    });

    it('setState updates a single experiment without disturbing siblings', () => {
        const {states, setState} = useSessions();
        setState('crucible', 'working');
        expect(states.value.crucible).toBe('working');
        expect(states.value.gatekeeper).toBe('idle');
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
        sessions.touch('crucible');
        sessions.focus('crucible');

        sessions.reset();

        expect(sessions.states.value.crucible).toBe('idle');
        expect(sessions.recency.value).toStrictEqual([]);
        expect(sessions.activeExperiment.value).toBeNull();
    });

    it('returns the same singleton state across calls', () => {
        useSessions().focus('smokestacks');
        expect(useSessions().activeExperiment.value).toBe('smokestacks');
    });
});
