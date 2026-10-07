// Brass has one home (#00067 AC-9, Pattern 013): its two hexes appear in
// exactly one file across src/, tests/ and uno.config.ts — src/shell/brass.ts.

import {describe, expect, it} from 'vitest';

import {BRASS, BRASS_DIM} from '../../src/shell/brass';

const sources = {
    ...import.meta.glob<string>('../../src/**/*.{ts,vue,js,css}', {query: '?raw', import: 'default', eager: true}),
    ...import.meta.glob<string>('../**/*.ts', {query: '?raw', import: 'default', eager: true}),
    ...import.meta.glob<string>('../../uno.config.ts', {query: '?raw', import: 'default', eager: true}),
};

describe('brass has one home', () => {
    it('should name the two brasses once, in src/shell/brass.ts', () => {
        expect(BRASS).toBe('#D4A24C');
        expect(BRASS_DIM).toBe('#8C6A2F');
        expect(Object.keys(sources).length).toBeGreaterThan(50);
        const homes = Object.entries(sources)
            .filter(([file, src]) => !file.endsWith('brass.spec.ts') && /#d4a24c|#8c6a2f/i.test(src))
            .map(([file]) => file);
        expect(homes).toStrictEqual(['../../src/shell/brass.ts']);
    });
});
