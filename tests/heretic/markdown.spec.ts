import {describe, expect, it} from 'vitest';

import {isWebReference, renderMarkdown} from '../../src/heretic/markdown';

function rendered(source: string): HTMLDivElement {
    const element = document.createElement('div');
    element.innerHTML = renderMarkdown(source);
    return element;
}

describe('Graphite Markdown', () => {
    it('renders prose, tables and highlighted code without changing the copied source', () => {
        const code = 'const example = "<script>";\n';
        const element = rendered(
            `# A finding\n\n**Verified**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n\`\`\`typescript\n${code}\`\`\``,
        );
        expect(element.querySelector('h1')?.textContent).toBe('A finding');
        expect(element.querySelector('strong')?.textContent).toBe('Verified');
        expect(element.querySelector('table')).not.toBeNull();
        expect(element.querySelector('pre code')?.textContent).toBe(code);
        expect(element.querySelector('[data-copy-code]')).not.toBeNull();
        expect(element.querySelector('script')).toBeNull();
    });

    it('does not execute raw HTML, remote images or protocol tricks', () => {
        const element = rendered(
            '<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))\n\n![remote](https://example.com/tracker)\n\n[local](file:///etc/passwd)',
        );
        expect(element.querySelector('img')).toBeNull();
        expect(element.querySelector('a')).toBeNull();
        expect(element.textContent).toContain('[Image: remote]');
        expect(isWebReference('java\nscript:alert(1)')).toBe(false);
        expect(isWebReference('https://example.com/path?q=1#here')).toBe(true);
    });

    it('makes real web links explicit and escapes a hostile code-language label', () => {
        const element = rendered('[Evidence](https://example.com)\n\n```"><img/src=x>\n<script>alert(1)</script>\n```');
        expect(element.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
        expect(element.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(element.querySelector('img,script')).toBeNull();
    });
});
