import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import Button from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export default function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
      onClick={e => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={subtitle ? "modal-subtitle" : undefined}
    >
      <div
        className={`relative w-full ${sizes[size]} bg-white border border-slate-200 rounded-xl shadow-2xl animate-slide-in flex flex-col max-h-[85vh] sm:max-h-[90vh] mx-1 sm:mx-0`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-200 flex-shrink-0 gap-2">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p id="modal-subtitle" className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose} 
            className="ml-4 -mt-0.5"
            aria-label="Fechar modal"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5">{children}</div>

        {footer && <div className="flex flex-wrap justify-end gap-2 sm:gap-3 p-4 sm:p-5 border-t border-slate-200 flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
