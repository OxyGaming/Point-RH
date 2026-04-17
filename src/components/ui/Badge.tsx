import { cn } from "@/lib/utils";

type Variant = "green" | "yellow" | "red" | "blue" | "gray" | "indigo" | "orange" | "purple";

const VARIANTS: Record<Variant, { pill: string; dot: string }> = {
  green:  { pill: "bg-[#ecfdf5] text-[#065f46]", dot: "bg-[#059669]" },
  yellow: { pill: "bg-[#fffbeb] text-[#92400e]", dot: "bg-[#d97706] animate-pulse" },
  red:    { pill: "bg-[#fef2f2] text-[#991b1b]", dot: "bg-[#dc2626]" },
  blue:   { pill: "bg-[#eff6ff] text-[#1e40af]", dot: "bg-[#2563eb]" },
  gray:   { pill: "bg-[#f4f6fb] text-[#4a5580]", dot: "bg-[#8b93b8]" },
  indigo: { pill: "bg-indigo-50 text-indigo-800",  dot: "bg-indigo-500" },
  orange: { pill: "bg-orange-50 text-orange-800",  dot: "bg-orange-500" },
  purple: { pill: "bg-purple-50 text-purple-800",  dot: "bg-purple-500" },
};

export default function Badge({
  children,
  variant = "gray",
  className,
  dot = true,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  dot?: boolean;
}) {
  const { pill, dot: dotClass } = VARIANTS[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11px] font-[600] tracking-[0.02em]",
        pill,
        className
      )}
    >
      {dot && <span className={cn("w-[5px] h-[5px] rounded-full shrink-0", dotClass)} />}
      {children}
    </span>
  );
}
