import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './Markdown';
import { localPath } from './api';
describe('Markdown preview', () => {
  const render = (content: string) => renderToStaticMarkup(<Markdown content={content} path="notes/test.md" onOpen={() => {}}/>);
  it('renders Persian, GFM tables, tasks and code', () => {
    const html = render('# سلام\n\n- [x] نوشتن\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst x = 1;\n```');
    expect(html).toContain('<h1>سلام</h1>'); expect(html).toContain('<table>'); expect(html).toContain('type="checkbox"'); expect(html).toContain('language-ts');
  });
  it('ignores raw HTML and blocks script links and remote images', () => {
    const html = render('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![tracker](https://remote.example/track.png)');
    expect(html).not.toContain('<script'); expect(html).not.toContain('href="javascript:'); expect(html).not.toContain('<img');
  });
  it('routes relative images through the restricted image endpoint', () => {
    expect(render('![Photo](../image.png)')).toContain('/api/image?path=image.png');
  });
  it('keeps local preview images in the selected workspace', () => {
    const html = renderToStaticMarkup(<Markdown content="![Photo](image.png)" path="test.md" workspace="notes/persian" onOpen={() => {}}/>);
    expect(html).toContain('workspace=notes%2Fpersian');
  });
  it('normalizes relative local links without escaping the workspace', () => {
    expect(localPath('../hello.md', 'notes/test.md')).toBe('hello.md');
    expect(localPath('../../hello.md', 'notes/test.md')).toBeNull();
    expect(localPath('https://example.com', 'test.md')).toBeNull();
    expect(localPath('%D8%B3%D9%84%D8%A7%D9%85.md', 'notes/test.md')).toBe('notes/سلام.md');
  });
});
