import { cn } from "@/lib/utils";

type Variant = "green" | "yellow" | "red" | "blue" | "gray" | "indigo" | "orange" | "purple";

const VARIANTS: Record<Variant, string> = {
  green:  "bg-green-100  text-green-800  border-green-300",
  yellow: "bg-amber-100  text-amber-800  border-amber-300",
  red:    "bg-red-100    text-red-800    border-red-300",
  blue:   "bg-blue-100   text-blue-800   border-blue-300",
  gray:   "bg-slate-100  text-slate-700  border-slate-300",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-300",
  orange: "bg-orange-100 text-orange-800 border-orange-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
};

export default function Badge({
  children,
  variant = "gray",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border",
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
