export function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "urgent" | "category";
}) {
  const styles = {
    default: "bg-slate-100 text-slate-700",
    urgent: "bg-red-100 text-red-800",
    category: "bg-amber-50 text-amber-900 border border-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
