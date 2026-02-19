import React from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 hover:bg-brand-700 text-white border border-brand-600 hover:border-brand-700",
  secondary: "bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-300",
  danger: "bg-rose-600 hover:bg-rose-700 text-white border border-rose-600",
  ghost: "bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-transparent",
  outline: "bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 hover:border-slate-400",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs font-medium gap-1.5",
  md: "px-4 py-2 text-sm font-medium gap-2",
  lg: "px-5 py-2.5 text-sm font-semibold gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`
        inline-flex items-center justify-center rounded-lg
        transition-all duration-150 cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-white
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
