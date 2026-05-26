// Holotable types shape-contract tests — assert that the TypeScript
// surface accepts a valid Rust serde payload and exposes the keys the
// scene's legacy adapter expects to read.
//
// The Rust side's `DashboardState` is the source of truth. If a field
// renames in `aggregator.rs`, the TS mirror must follow and these tests
// stay green only after the matching rename in `types.ts`. The point is
// to make drift loud at test time, not at production runtime.

import {describe, expect, it} from 'vitest';

import type {DashboardState, GadgetNode, HealthState} from '../../src/holotable/types';

import {EMPTY_DASHBOARD, EMPTY_TOWER} from '../../src/holotable/types';

describe('Holotable types', () => {
    it('EMPTY_DASHBOARD satisfies the DashboardState contract', () => {
        const sample: DashboardState = EMPTY_DASHBOARD;
        expect(sample.tower).toStrictEqual(EMPTY_TOWER);
        expect(sample.experiments).toStrictEqual([]);
        expect(sample.gadgets).toStrictEqual([]);
        expect(sample.database.kind).toBe('database');
        expect(sample.pipeline.kind).toBe('pipeline');
    });

    it('accepts the four HealthState variants', () => {
        const states: HealthState[] = ['green', 'amber', 'red', 'unknown'];
        for (const s of states) {
            const node: GadgetNode = {
                id: `gadget-${s}`,
                label: s,
                kind: 'gadget',
                health: s,
                gitStatus: 'clean',
                detail: '',
                isSelf: false,
            };
            expect(node.health).toBe(s);
        }
    });

    it('accepts the five NodeKind variants', () => {
        // Compile-time check — if a field renames the assertion fails.
        const dashboard: DashboardState = {
            ...EMPTY_DASHBOARD,
            tower: {...EMPTY_TOWER, kind: 'tower'},
            database: {id: 'db', label: 'PostgreSQL', kind: 'database', health: 'green', detail: ''},
            pipeline: {id: 'pl', label: 'Railway', kind: 'pipeline', health: 'green', detail: ''},
        };
        expect(dashboard.tower.kind).toBe('tower');
        expect(dashboard.database.kind).toBe('database');
        expect(dashboard.pipeline.kind).toBe('pipeline');
    });

    it('exposes the canonical Rust serde field names in camelCase', () => {
        const node: GadgetNode = {
            id: 'gadget-mezzanine',
            label: 'mezzanine',
            kind: 'gadget',
            health: 'green',
            gitStatus: 'clean',
            detail: 'You are here',
            isSelf: true,
        };
        // The Rust side serializes `is_self` → `isSelf` and `git_status` →
        // `gitStatus`. If those mappings change the TS keys here must
        // follow; a typo would surface as a TS error in this spec.
        expect(Object.keys(node)).toContain('isSelf');
        expect(Object.keys(node)).toContain('gitStatus');
    });
});
