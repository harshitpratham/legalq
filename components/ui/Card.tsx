import { type HTMLAttributes, type ReactNode } from "react";

export function Card({
  children,
  className = "",
  title,
  action,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm ${className}`}
      {...props}
    >
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="font-medium text-[var(--foreground)]">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
