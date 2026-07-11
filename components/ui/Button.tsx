import { type ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-50",
  secondary:
    "border border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-slate-50 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
  ghost: "text-[var(--muted)] hover:bg-slate-50 disabled:opacity-50",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-1 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
