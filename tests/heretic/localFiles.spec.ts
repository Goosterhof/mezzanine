import {describe, expect, it} from 'vitest';

import {imageMime, localFilePath} from '../../src/heretic/localFiles';
import {renderMarkdown} from '../../src/heretic/markdown';

describe('Local conversation references', () => {
    it('decodes spaces and source line references without accepting URL or traversal tricks', () => {
        expect(localFilePath('/home/lab/my%20art.png')).toBe('/home/lab/my art.png');
        expect(localFilePath('/home/lab/app.rs:12:3')).toBe('/home/lab/app.rs');
        for (const path of [
            '../art.png',
            '//server/share/art.png',
            'file:///home/lab/a.png',
            'https://site/a.png',
            '/home/lab/../secret',
            '/home/lab/./secret',
            '/home/lab/%2e%2e/secret',
            '/home/lab/%5cserver',
            '/home/lab/%0a',
            '/broken%xx',
            '/home/lab/x?y',
            '/home/lab/x:stream',
        ]) {
            expect(localFilePath(path)).toBeNull();
        }
    });
    it('supports only browser raster formats', () => {
        for (const [ext, mime] of [
            ['PNG', 'image/png'],
            ['jpg', 'image/jpeg'],
            ['jpeg', 'image/jpeg'],
            ['gif', 'image/gif'],
            ['webp', 'image/webp'],
        ])
            expect(imageMime(`/lab/a.${ext}`)).toBe(mime);
        expect(imageMime('/lab/a.svg')).toBeNull();
        expect(imageMime('/lab/script.exe')).toBeNull();
    });
    it('makes explicit local links actionable without loading files or remote images', () => {
        const div = document.createElement('div');
        div.innerHTML = renderMarkdown(
            '[Image](</home/lab/my art.png>) ![Preview](/home/lab/art.png) ![Remote](https://tracker/image.png)',
        );
        expect(
            [...div.querySelectorAll('[data-local-file]')].map((a) => a.getAttribute('data-local-file')),
        ).toStrictEqual(['/home/lab/my art.png', '/home/lab/art.png']);
        expect(div.querySelector('img')).toBeNull();
        expect(div.querySelector('[data-local-file]')?.getAttribute('href')).toBe('#');
    });
});
