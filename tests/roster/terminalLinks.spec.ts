import {describe, expect, it, vi} from 'vitest';

import {createTerminalLinks} from '../../src/roster/terminalLinks';

const range = {start: {x: 1, y: 1}, end: {x: 20, y: 1}};

describe('terminal links', () => {
    it('opens web destinations only on a deliberate primary-button chord', () => {
        const open = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
        const {handler} = createTerminalLinks(open);
        handler.activate(new MouseEvent('click'), 'https://example.com', range);
        handler.activate(new MouseEvent('click', {ctrlKey: true, button: 1}), 'https://example.com', range);
        expect(open).not.toHaveBeenCalled();
        handler.activate(new MouseEvent('click', {ctrlKey: true}), 'https://example.com/a?q=1#part', range);
        handler.activate(new MouseEvent('click', {metaKey: true}), 'http://localhost:1430', range);
        expect(open.mock.calls).toStrictEqual([['https://example.com/a?q=1#part'], ['http://localhost:1430']]);
    });

    it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,test', 'not a URL'])(
        'does not hand %s to the operating system',
        (url) => {
            const open = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
            createTerminalLinks(open).handler.activate(new MouseEvent('click', {ctrlKey: true}), url, range);
            expect(open).not.toHaveBeenCalled();
        },
    );

    it('shows the actual destination, and retains a failed-open notice after leaving', async () => {
        const {handler, notice} = createTerminalLinks(() => Promise.reject(new Error('opener refused')));
        const event = new MouseEvent('click', {ctrlKey: true});
        handler.hover?.(event, 'https://example.com/actual', range);
        expect(notice.value?.text).toContain('https://example.com/actual');
        handler.leave?.(event, 'https://example.com/actual', range);
        expect(notice.value).toBeNull();
        handler.activate(event, 'https://example.com/actual', range);
        await Promise.resolve();
        handler.leave?.(event, 'https://example.com/actual', range);
        expect(notice.value?.error).toBe(true);
    });
});
