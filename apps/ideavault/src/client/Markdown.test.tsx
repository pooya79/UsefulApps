import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';
describe('safe GitHub-flavored Markdown', () => {
  it('renders headings, links, tables, tasks, quotes, and fenced code', () => {
    const html = renderToStaticMarkup(<Markdown content={'# Heading\n\n[link](https://example.com)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] complete\n\n> Quote\n\n```js\nconst answer = 42;\n```'}/>);
    for (const marker of ['<h1>', '<a ', '<table>', 'type="checkbox"', '<blockquote>', 'language-js', 'noopener noreferrer']) expect(html).toContain(marker);
  });
  it('does not execute raw HTML or dangerous links, or fetch embedded images', () => {
    const html = renderToStaticMarkup(<Markdown content={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[danger](javascript:alert%281%29)\n\n![remote](https://tracking.example/pixel)'}/>);
    expect(html).not.toContain('<script'); expect(html).not.toContain('<img'); expect(html).not.toContain('javascript:'); expect(html).not.toContain('onerror'); expect(html).toContain('[Image: remote]');
  });
});
