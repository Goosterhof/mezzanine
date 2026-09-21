import {beforeEach, describe, expect, it} from 'vitest';

import {PAGES, useShell} from '../../src/shell/useShell';
describe('page navigation', () => {
    beforeEach(() => useShell().reset());
    it('starts at the conversation', () => expect(useShell().page.value).toBe('conversation'));
    it.each(PAGES)('selects $label idempotently', ({id}) => {
        useShell().navigate(id);
        useShell().navigate(id);
        expect(useShell().page.value).toBe(id);
    });
    it('shares navigation state and returns home on reset', () => {
        useShell().navigate('grind');
        const other = useShell();
        expect(other.page.value).toBe('grind');
        other.reset();
        expect(useShell().page.value).toBe('conversation');
    });
});
