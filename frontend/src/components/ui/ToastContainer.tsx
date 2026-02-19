import React from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useToast, type ToastType } from "@/contexts/ToastContext";

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />,
  error:   <XCircle size={16} className="text-rose-400 flex-shrink-0" />,
  warning: <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />,
  info:    <Info size={16} className="text-blue-400 flex-shrink-0" />,
};

const bg: Record<ToastType, string> = {
  success: "border-emerald-500/40 bg-emerald-500/10",
  error:   "border-rose-500/40 bg-rose-500/10",
  warning: "border-amber-500/40 bg-amber-500/10",
  info:    "border-blue-500/40 bg-blue-500/10",
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-3.5 rounded-lg border backdrop-blur-sm shadow-lg animate-slide-in ${bg[t.type]}`}
        >
          {icons[t.type]}
          <p className="text-sm text-slate-900 flex-1 font-medium">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="text-slate-600 hover:text-slate-900 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
