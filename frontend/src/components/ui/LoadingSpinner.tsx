import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  fullPage?: boolean;
  text?: string;
}

const sizes = { sm: "w-4 h-4 border-2", md: "w-8 h-8 border-2", lg: "w-12 h-12 border-3" };

export default function LoadingSpinner({ size = "md", className = "", fullPage = false, text }: LoadingSpinnerProps) {
  const spinner = (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className={`${sizes[size]} border-slate-600 border-t-brand-500 rounded-full animate-spin`} />
      {text && <p className="text-sm text-slate-400">{text}</p>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-100/95 backdrop-blur-sm z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}
