import { cn } from "@/lib/utils";

type AccentColor = "blue" | "green" | "amber" | "red" | "none";

const ACCENT_COLORS: Record<AccentColor, string> = {
  blue:  "before:bg-[#2563eb]",
  green: "before:bg-[#059669]",
  amber: "before:bg-[#d97706]",
  red:   "before:bg-[#dc2626]",
  none:  "",
};

export function Card({
  children,
  className,
  accent,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: AccentColor;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-[#e2e8f5] overflow-hidden relative",
        "shadow-[0_1px_3px_rgba(15,27,76,0.07),0_1px_2px_rgba(15,27,76,0.04)]",
        accent && accent !== "none" && "before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px]",
        accent && accent !== "none" && ACCENT_COLORS[accent],
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-4 border-b border-[#e2e8f5] bg-[#f8f9fd]", className)}>
      <div>{children}</div>
      {action && <div className="ml-4 shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-[13px] font-[700] text-[#0f1b4c] tracking-tight", className)}>{children}</h2>;
}

export function CardSubtitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] text-[#8b93b8] mt-0.5", className)}>{children}</p>;
}
