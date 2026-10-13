import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-400",
  secondary: "border border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50",
  danger: "border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50",
  ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9 px-3.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
