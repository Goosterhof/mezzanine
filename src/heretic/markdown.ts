import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import rust from 'highlight.js/lib/languages/rust';
import typescript from 'highlight.js/lib/languages/typescript';
import MarkdownIt from 'markdown-it';

import {localFilePath} from './localFiles';

for (const [name, language] of Object.entries({bash, javascript, json, rust, typescript})) {
    hljs.registerLanguage(name, language);
}

export function isWebReference(url: string): boolean {
    try {
        return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
        return false;
    }
}

const markdown = new MarkdownIt({html: false, linkify: true, breaks: false});
// Coding replies name files such as mod.rs and README.md. Keep them as prose,
// independent of library defaults; auto-link only explicit web references.
markdown.linkify.set({fuzzyLink: false});
markdown.validateLink = (url) => isWebReference(url) || localFilePath(url) !== null;
markdown.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const path = localFilePath(String(token?.attrGet('src') ?? ''));
    const label = markdown.utils.escapeHtml(token?.content || 'View image');
    return path
        ? `<a href="#" data-local-file="${markdown.utils.escapeHtml(path)}" title="View image">${label}</a>`
        : `<span class="graphite-image-note">[Image: ${label}]</span>`;
};
markdown.renderer.rules.link_open = (tokens, index, options) => {
    const path = localFilePath(String(tokens[index]?.attrGet('href') ?? ''));
    if (path) {
        tokens[index]?.attrSet('href', '#');
        tokens[index]?.attrSet('data-local-file', path);
        tokens[index]?.attrSet('title', path);
        return markdown.renderer.renderToken(tokens, index, options);
    }
    tokens[index]?.attrSet('rel', 'noopener noreferrer');
    tokens[index]?.attrSet('target', '_blank');
    return markdown.renderer.renderToken(tokens, index, options);
};
markdown.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const code = token?.content ?? '';
    const language = token?.info.trim().split(/\s+/)[0] ?? '';
    const highlighted =
        language && hljs.getLanguage(language)
            ? hljs.highlight(code, {language, ignoreIllegals: true}).value
            : markdown.utils.escapeHtml(code);
    return `<div class="graphite-code"><div class="graphite-code-header"><span>${markdown.utils.escapeHtml(language || 'Code')}</span><button type="button" data-copy-code>Copy code</button></div><pre tabindex="0"><code>${highlighted}</code></pre></div>`;
};

export function renderMarkdown(text: string): string {
    return markdown.render(text);
}
