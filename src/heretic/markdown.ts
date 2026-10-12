import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import rust from 'highlight.js/lib/languages/rust';
import typescript from 'highlight.js/lib/languages/typescript';
import MarkdownIt from 'markdown-it';

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
markdown.validateLink = isWebReference;
markdown.renderer.rules.image = (tokens, index) =>
    `<span class="graphite-image-note">[Image: ${markdown.utils.escapeHtml(tokens[index]?.content ?? 'attachment')}]</span>`;
markdown.renderer.rules.link_open = (tokens, index, options) => {
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
