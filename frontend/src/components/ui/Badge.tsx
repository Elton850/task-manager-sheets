import React from "react";

type BadgeVariant = "blue" | "green" | "red" | "amber" | "slate" | "indigo" | "purple";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  blue: "bg-blue-50 text-blue-800 border border-blue-200",
  green: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  red: "bg-rose-50 text-rose-800 border border-rose-200",
  amber: "bg-amber-50 text-amber-800 border border-amber-200",
  slate: "bg-slate-100 text-slate-700 border border-slate-200",
  indigo: "bg-brand-50 text-brand-800 border border-brand-200",
  purple: "bg-brand-50 text-brand-800 border border-brand-200",
};

export function getStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "Em Andamento":
      return "blue";
    case "Concluído":
      return "green";
    case "Em Atraso":
      return "red";
    case "Concluído em Atraso":
      return "amber";
    default:
      return "slate";
  }
}

export function getRoleVariant(role: string): BadgeVariant {
  switch (role) {
    case "ADMIN":
      return "indigo";
    case "LEADER":
      return "indigo";
    default:
      return "slate";
  }
}

export default function Badge({ children, variant = "slate", size = "sm", className = "" }: BadgeProps) {
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";

  return <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${variants[variant]} ${className}`}>{children}</span>;
}
