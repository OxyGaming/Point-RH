import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  label?: string; // texte pour screen readers
}

const SIZES = {
  xs: "w-3 h-3 border",
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-[3px]",
};

export default function Spinner({ size = "md", className, label = "Chargement…" }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center justify-center">
      <span
        className={cn(
          "rounded-full border-current border-r-transparent animate-spin",
          SIZES[size],
          className
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
