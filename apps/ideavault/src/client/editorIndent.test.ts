import { describe, expect, it } from 'vitest';
import { editIndent } from './editorIndent';

describe('Markdown editor indentation', () => {
  it('inserts four spaces at the caret', () => {
    expect(editIndent('hello', 2, 2, false)).toEqual({ content: 'he    llo', selectionStart: 6, selectionEnd: 6 });
  });

  it('indents every selected line and keeps it selected', () => {
    expect(editIndent('one\ntwo\nthree', 0, 7, false)).toEqual({ content: '    one\n    two\nthree', selectionStart: 4, selectionEnd: 15 });
  });

  it('outdents selected lines by up to four spaces', () => {
    expect(editIndent('    one\n  two\nthree', 0, 13, true)).toEqual({ content: 'one\ntwo\nthree', selectionStart: 0, selectionEnd: 7 });
  });

  it('outdents the current line without a selection', () => {
    expect(editIndent('before\n    idea', 12, 12, true)).toEqual({ content: 'before\nidea', selectionStart: 8, selectionEnd: 8 });
  });
});
