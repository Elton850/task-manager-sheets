import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export default function Input({ label, error, hint, leftIcon, className = "", id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
          {props.required && <span className="text-rose-400 ml-1" aria-label="obrigatório">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          {...props}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`
            w-full rounded-lg bg-white border text-slate-900 placeholder-slate-400
            px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
            ${leftIcon ? "pl-10" : ""}
            ${error ? "border-rose-500 focus:ring-rose-500" : "border-slate-300 hover:border-slate-400"}
            ${className}
          `}
        />
      </div>
      {error && <p id={`${inputId}-error`} className="text-xs text-rose-400" role="alert">{error}</p>}
      {hint && !error && <p id={`${inputId}-hint`} className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
