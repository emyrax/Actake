import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import { MascotDisplay } from './MascotDisplay';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastHostProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastHost: React.FC<ToastHostProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[360px] z-[80] flex flex-col gap-2.5 pointer-events-none"
    >
      {toasts.map((toast) => {
        const toneStyles =
          toast.tone === 'success'
            ? {
                wrap: 'bg-white border-[#BBF7D0] text-[#111114]',
                iconWrap: 'bg-[#ECFDF5] text-[#16A34A]',
                Icon: CheckCircle2,
              }
            : toast.tone === 'error'
              ? {
                  wrap: 'bg-white border-[#FECACA] text-[#111114]',
                  iconWrap: 'bg-[#FEF2F2] text-[#DC2626]',
                  Icon: AlertTriangle,
                }
              : {
                  wrap: 'bg-white border-[#F2DDD0] text-[#111114]',
                  iconWrap: 'bg-[#FFF3EC] text-[#F16A2E]',
                  Icon: Info,
                };
        const Icon = toneStyles.Icon;

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto actake-toast-in rounded-2xl border px-4 py-3.5 shadow-[0_14px_34px_rgba(17,17,20,0.14)] flex items-start gap-3 ${toneStyles.wrap}`}
          >
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${toneStyles.iconWrap}`}
            >
              <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#111114] leading-snug">{toast.title}</div>
              {toast.detail && (
                <p className="text-[11px] text-[#6B6663] mt-0.5 leading-relaxed">{toast.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="w-7 h-7 rounded-full hover:bg-[#FFF4EE] flex items-center justify-center text-[#877F7A] hover:text-[#111114] shrink-0 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={onCancel}
      className="fixed inset-0 z-[75] bg-[#111114]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-[28px] sm:rounded-[28px] bg-white border border-[#EFE2D9] p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-start gap-3.5">
          <span
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              destructive ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#FFF3EC] text-[#F16A2E]'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="space-y-1 min-w-0">
            <h3
              id="confirm-dialog-title"
              className="font-display text-lg font-extrabold text-[#111114]"
            >
              {title}
            </h3>
            <p id="confirm-dialog-desc" className="text-xs text-[#6B6663] leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[46px] px-4 py-2.5 rounded-full bg-[#FFF4EE] hover:bg-[#FFE6D8] text-[#111114] text-xs font-bold transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[46px] px-4 py-2.5 rounded-full text-white text-xs font-bold transition-colors ${
              destructive
                ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                : 'bg-[#111114] hover:bg-[#F16A2E]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

interface EmptyStateProps {
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: React.ReactNode;
  showMascot?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  ctaLabel,
  onCta,
  icon,
  showMascot = false,
  className = '',
}) => {
  return (
    <div className={`actake-card p-6 sm:p-8 text-center flex flex-col items-center gap-3.5 ${className}`}>
      {showMascot ? (
        <MascotDisplay variant="stage" size="md" floating alt="Actake Empty State Mascot" />
      ) : icon ? (
        <div className="w-12 h-12 rounded-2xl bg-[#FFF3EC] text-[#F16A2E] flex items-center justify-center">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1 max-w-sm">
        <h3 className="font-display text-base font-extrabold text-[#111114]">{title}</h3>
        <p className="text-xs sm:text-sm text-[#6B6663] leading-relaxed">{description}</p>
      </div>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors whitespace-nowrap"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
};

interface ErrorStateCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorStateCard: React.FC<ErrorStateCardProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#991B1B]">{title}</div>
          <p className="text-xs text-[#7F1D1D] mt-0.5 leading-relaxed break-words">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[40px] px-4 py-2 rounded-full bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
};

export const ActivityPulseSkeleton: React.FC = () => (
  <div className="actake-card p-5 space-y-4" aria-label="Loading live community activity">
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-1.5 flex-1">
        <div className="h-4 w-36 rounded-full actake-skeleton" />
        <div className="h-3 w-48 rounded-full actake-skeleton" />
      </div>
      <div className="h-4 w-20 rounded-full actake-skeleton" />
    </div>
    <div className="divide-y divide-[#F6EFEA]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-full actake-skeleton shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-3/4 rounded-full actake-skeleton" />
              <div className="h-3 w-1/2 rounded-full actake-skeleton" />
            </div>
          </div>
          <div className="w-5 h-5 rounded-full actake-skeleton shrink-0" />
        </div>
      ))}
    </div>
  </div>
);

export const LobbyLayoutSkeleton: React.FC = () => (
  <div className="space-y-6 pb-10" aria-label="Loading squad lobby">
    <div className="flex items-center justify-between">
      <div className="h-10 w-32 rounded-full actake-skeleton" />
      <div className="h-4 w-28 rounded-full actake-skeleton" />
    </div>
    <div className="rounded-[28px] bg-[#141416] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
      <div className="flex items-center gap-5 flex-1">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[26px] bg-white/10 animate-pulse shrink-0" />
        <div className="space-y-2.5 flex-1">
          <div className="h-3.5 w-48 rounded-full bg-white/15" />
          <div className="h-8 w-64 max-w-full rounded-full bg-white/20" />
          <div className="h-4 w-72 max-w-full rounded-full bg-white/12" />
        </div>
      </div>
      <div className="flex gap-2.5">
        <div className="h-12 w-36 rounded-full bg-[#F16A2E]/40" />
        <div className="h-12 w-32 rounded-full bg-white/15" />
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 actake-card p-6 space-y-3.5">
        <div className="h-5 w-40 rounded-full actake-skeleton" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 w-full rounded-2xl actake-skeleton" />
        ))}
      </div>
      <div className="lg:col-span-7 actake-card p-6 space-y-3.5">
        <div className="h-5 w-48 rounded-full actake-skeleton" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-full rounded-2xl actake-skeleton" />
        ))}
      </div>
    </div>
  </div>
);

export const DiagnosticsGridSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5" aria-label="Loading diagnostics">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="actake-card p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-28 rounded-full actake-skeleton" />
          <div className="h-4 w-20 rounded-full actake-skeleton" />
        </div>
        <div className="h-3 w-full rounded-full actake-skeleton" />
        <div className="h-3 w-2/3 rounded-full actake-skeleton" />
      </div>
    ))}
  </div>
);

interface SparklineSvgProps {
  values: number[];
  stroke?: string;
  fillFrom?: string;
  className?: string;
}

export const SparklineSvg: React.FC<SparklineSvgProps> = ({
  values,
  stroke = '#F16A2E',
  fillFrom = 'rgba(241, 106, 46, 0.24)',
  className = 'w-full h-12',
}) => {
  const safeValues = values.length >= 2 ? values : [40, 52, 48, 66, 72, 85, 92];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = Math.max(1, max - min);
  const width = 180;
  const height = 48;
  const padY = 6;

  const points = safeValues.map((v, idx) => {
    const x = (idx / (safeValues.length - 1)) * width;
    const y = height - padY - ((v - min) / range) * (height - padY * 2);
    return { x, y };
  });

  const linePath = points
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  const last = points[points.length - 1];
  const gradId = `spark-${stroke.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={fillFrom} />
          <stop offset="100%" stopColor="rgba(241,106,46,0)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill={stroke} />
    </svg>
  );
};
