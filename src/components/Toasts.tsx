import { Check, Info, Trash2 } from 'lucide-react';
import { dismissToast, useToasts } from '../modules/toasts';

const TONE_ICONS = { success: Check, neutral: Info, danger: Trash2 };

// Confirmation stack; announced politely to screen readers
export function Toasts() {
  const toasts = useToasts();

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = TONE_ICONS[toast.tone];
        return (
          <div key={toast.id} className={`toast is-${toast.tone}`}>
            <span className="toast-icon" aria-hidden="true">
              <Icon size={14} strokeWidth={2.6} />
            </span>
            <span className="toast-copy">
              <span className="toast-message">{toast.message}</span>
              {toast.detail && <span className="toast-detail">{toast.detail}</span>}
            </span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                className="toast-action"
                data-sfx="none"
                onClick={() => {
                  toast.onAction?.();
                  dismissToast(toast.id);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
