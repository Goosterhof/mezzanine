import {describe, expect, it} from 'vitest';

import type {Target} from '../../src/roster/types';

import {TARGET_OPTIONS, targetKey, targetLabel} from '../../src/roster/types';

describe('roster/types — labels and keys', () => {
    it('targetLabel resolves each experiment codename', () => {
        const cases: Array<{target: Target; label: string}> = [
            {target: {kind: 'experiment', codename: 'gatekeeper'}, label: 'The Gatekeeper'},
            {target: {kind: 'experiment', codename: 'war-table'}, label: 'The War Table'},
            {target: {kind: 'experiment', codename: 'crucible'}, label: 'The Crucible'},
            {target: {kind: 'experiment', codename: 'parlour'}, label: 'The Parlour'},
            {target: {kind: 'experiment', codename: 'smokestacks'}, label: 'The Smokestacks'},
            {target: {kind: 'experiment', codename: 'horadrim'}, label: 'The Horadrim'},
        ];
        for (const {target, label} of cases) {
            expect(targetLabel(target)).toBe(label);
        }
    });

    it('targetLabel resolves each gadget codename', () => {
        expect(targetLabel({kind: 'gadget', codename: 'observer'})).toBe('The Observer');
        expect(targetLabel({kind: 'gadget', codename: 'holotable'})).toBe('The Holotable');
        expect(targetLabel({kind: 'gadget', codename: 'grind'})).toBe('The Grind');
        expect(targetLabel({kind: 'gadget', codename: 'horadric-cube'})).toBe('The Horadric Cube');
        expect(targetLabel({kind: 'gadget', codename: 'mezzanine'})).toBe('The Mezzanine');
    });

    it('targetLabel resolves the lab-nav package and the lab root', () => {
        expect(targetLabel({kind: 'package', codename: 'lab-nav'})).toBe('lab-nav');
        expect(targetLabel({kind: 'lab-root'})).toBe('The Lab');
    });

    it('targetKey returns a stable colon-delimited string for non-lab targets', () => {
        expect(targetKey({kind: 'experiment', codename: 'crucible'})).toBe('experiment:crucible');
        expect(targetKey({kind: 'gadget', codename: 'mezzanine'})).toBe('gadget:mezzanine');
        expect(targetKey({kind: 'package', codename: 'lab-nav'})).toBe('package:lab-nav');
    });

    it('targetKey returns the literal lab-root for the lab root target', () => {
        expect(targetKey({kind: 'lab-root'})).toBe('lab-root');
    });

    it('TARGET_OPTIONS covers all 13 targets', () => {
        expect(TARGET_OPTIONS).toHaveLength(13);
        const groups = new Set(TARGET_OPTIONS.map((o) => o.group));
        expect(groups).toStrictEqual(new Set(['Experiments', 'Gadgets', 'Packages', 'The Lab']));
    });
});
