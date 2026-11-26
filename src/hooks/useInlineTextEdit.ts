import { useLayoutEffect, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';

interface InlineTextEditOptions {
  text: string;
  onCommit: (newText: string) => void;
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

// The text node is owned by this hook (not React children) so contentEditable typing never fights reconciliation
export function useInlineTextEdit({ text, onCommit }: InlineTextEditOptions) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const cancelled = useRef(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !isEditing && el.textContent !== text) el.textContent = text;
  }, [text, isEditing]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || !isEditing) return;
    el.contentEditable = 'true';
    el.focus();
    placeCaretAtEnd(el);
  }, [isEditing]);

  const startEditing = () => {
    if (isEditing) return;
    cancelled.current = false;
    setIsEditing(true);
  };

  const handleBlur = () => {
    const el = textRef.current;
    if (!el) return;
    el.contentEditable = 'false';
    setIsEditing(false);
    if (cancelled.current) return;
    onCommit((el.textContent || '').trim());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    const el = textRef.current;
    if (!el) return;
    if (e.key === 'Enter') {
      // Enter that confirms an IME candidate is not a commit
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      el.blur();
    } else if (e.key === 'Escape') {
      cancelled.current = true;
      el.textContent = text;
      el.blur();
    }
  };

  // Paste as plain text on one line: no pasted markup, and line breaks become spaces
  const handlePaste = (e: ClipboardEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ');
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(pasted);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  return { textRef, isEditing, startEditing, handleBlur, handleKeyDown, handlePaste };
}
