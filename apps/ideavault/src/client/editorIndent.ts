export type IndentEdit = {
  content: string;
  selectionStart: number;
  selectionEnd: number;
};

const INDENT = '    ';

export function editIndent(content: string, selectionStart: number, selectionEnd: number, outdent: boolean): IndentEdit {
  if (!outdent && selectionStart === selectionEnd) {
    return {
      content: content.slice(0, selectionStart) + INDENT + content.slice(selectionEnd),
      selectionStart: selectionStart + INDENT.length,
      selectionEnd: selectionStart + INDENT.length,
    };
  }

  const lineStart = content.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const effectiveEnd = selectionEnd > selectionStart && content[selectionEnd - 1] === '\n' ? selectionEnd - 1 : selectionEnd;
  const nextNewline = content.indexOf('\n', effectiveEnd);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;
  const block = content.slice(lineStart, lineEnd);

  if (!outdent) {
    const lines = block.split('\n');
    const indented = lines.map(line => INDENT + line).join('\n');
    return {
      content: content.slice(0, lineStart) + indented + content.slice(lineEnd),
      selectionStart: selectionStart + INDENT.length,
      selectionEnd: selectionEnd + (INDENT.length * lines.length),
    };
  }

  let removedBeforeStart = 0;
  let removedBeforeEnd = 0;
  let offset = lineStart;
  const outdented = block.split('\n').map(line => {
    const removed = Math.min(INDENT.length, line.match(/^ */)?.[0].length ?? 0);
    if (offset < selectionStart) removedBeforeStart += Math.min(removed, selectionStart - offset);
    if (offset < selectionEnd) removedBeforeEnd += Math.min(removed, selectionEnd - offset);
    offset += line.length + 1;
    return line.slice(removed);
  }).join('\n');

  return {
    content: content.slice(0, lineStart) + outdented + content.slice(lineEnd),
    selectionStart: selectionStart - removedBeforeStart,
    selectionEnd: selectionEnd - removedBeforeEnd,
  };
}
