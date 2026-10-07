import { useEffect, useRef } from 'react';

/** Keep keyboard focus inside an open dialog and return it to its trigger. */
export function useDialogFocus(isOpen: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    (controls()[0] ?? dialog).focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0], last = elements[elements.length-1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();first.focus();
      }
    };
    document.addEventListener('keydown', trap, true);
    return () => { document.removeEventListener('keydown', trap, true); if (previous?.isConnected) previous.focus(); };
  }, [isOpen]);
  return dialogRef;
}
