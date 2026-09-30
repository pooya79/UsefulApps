import { describe, expect, it } from 'vitest';
import { editIndent } from './editorIndent';

describe('Markdown editor indentation', () => {
  it('inserts two spaces at the caret', () => {
    expect(editIndent('hello', 2, 2, false)).toEqual({ content: 'he  llo', selectionStart: 4, selectionEnd: 4 });
  });

  it('indents every selected line and keeps it selected', () => {
    expect(editIndent('one\ntwo\nthree', 0, 7, false)).toEqual({ content: '  one\n  two\nthree', selectionStart: 2, selectionEnd: 11 });
  });

  it('outdents selected lines by up to two spaces', () => {
    expect(editIndent('  one\n  two\nthree', 0, 11, true)).toEqual({ content: 'one\ntwo\nthree', selectionStart: 0, selectionEnd: 7 });
  });

  it('outdents the current line without a selection', () => {
    expect(editIndent('before\n  idea', 10, 10, true)).toEqual({ content: 'before\nidea', selectionStart: 8, selectionEnd: 8 });
  });
});
