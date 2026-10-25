// The command bar can be reached from anywhere that suggests a task (the Clear Horizon starters,
// the empty log). Rather than thread a ref through the tree, callers publish the text here and the
// bar listens, fills its field and takes focus.
export const COMMAND_PREFILL_EVENT = 'actionstodo:command-prefill';

export function prefillCommand(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(COMMAND_PREFILL_EVENT, { detail: text }));
  document.querySelector<HTMLInputElement>('.quick-add-input')?.focus();
}
