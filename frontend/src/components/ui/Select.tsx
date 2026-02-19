import React from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export default function Select({
  label,
  error,
  hint,
  options,
  placeholder,
  className = "",
  id,
  ...props
}: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
          {label}
          {props.required && <span className="text-rose-500 ml-1" aria-label="obrigatório">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          {...props}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          className={`
            w-full rounded-lg bg-white border text-slate-900
            px-3 py-2 pr-10 text-sm
            focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors appearance-none cursor-pointer
            ${error ? "border-rose-500 focus:ring-rose-500" : "border-slate-300 hover:border-slate-400"}
            ${className}
          `}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <ChevronDown size={16} />
        </div>
      </div>
      {error && <p id={`${selectId}-error`} className="text-xs text-rose-500" role="alert">{error}</p>}
      {hint && !error && <p id={`${selectId}-hint`} className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
