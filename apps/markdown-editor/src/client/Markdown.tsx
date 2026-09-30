import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { localPath } from './api';
export function Markdown({ content, path, workspace = '', onOpen }: { content: string; path: string; workspace?: string; onOpen: (path: string) => void }) {
  return <article className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    a: ({ children, href, ...props }) => {
      const file = href ? localPath(href, path) : null;
      return file && /\.(md|markdown|mdown)$/i.test(file)
        ? <a {...props} href={href} onClick={e => { e.preventDefault(); onOpen(file); }}>{children}</a>
        : <a {...props} href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a>;
    },
    img: ({ src, alt }) => {
      const file = typeof src === 'string' ? localPath(src, path) : null;
      return file ? <img src={`/api/image?path=${encodeURIComponent(file)}&workspace=${encodeURIComponent(workspace)}`} alt={alt || ''} loading="lazy"/> : <span className="image-note">[External image: {alt || 'image'}]</span>;
    }
  }}>{content}</ReactMarkdown></article>;
}
