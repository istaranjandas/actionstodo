import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

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
      e.preventDefault();
      el.blur();
    } else if (e.key === 'Escape') {
      cancelled.current = true;
      el.textContent = text;
      el.blur();
    }
  };

  return { textRef, isEditing, startEditing, handleBlur, handleKeyDown };
}
