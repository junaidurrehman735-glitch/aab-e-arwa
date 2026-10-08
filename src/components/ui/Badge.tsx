import React from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: React.ReactNode;
  showDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  showDot = true,
}) => {
  const styles = {
    success: 'text-emerald-700 bg-emerald-50/80 border-emerald-200/60',
    warning: 'text-amber-700 bg-amber-50/80 border-amber-200/60',
    danger: 'text-rose-700 bg-rose-50/80 border-rose-200/60',
    info: 'text-sky-700 bg-sky-50/80 border-sky-200/60',
    neutral: 'text-slate-600 bg-slate-100/80 border-slate-200/60',
  }[variant];

  const dotColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-sky-500',
    neutral: 'bg-slate-400',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium border ${styles}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors}`} />}
      <span>{children}</span>
    </span>
  );
};
