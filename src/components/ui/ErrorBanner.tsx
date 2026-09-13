import { AlertTriangle } from 'lucide-react';

export function ErrorBanner({ title, message }: { title?: string; message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>
        {title && <div className="font-medium">{title}</div>}
        <div className={title ? 'mt-0.5 text-xs opacity-90' : ''}>{message}</div>
      </div>
    </div>
  );
}
