import React from "react";
import Modal from "./Modal";
import Button from "./Button";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  variant = "danger", loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 items-start min-w-0">
        {variant === "danger" && (
          <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-rose-500/15 flex items-center justify-center">
            <AlertTriangle size={16} className="text-rose-400" />
          </div>
        )}
        <p className="text-sm text-slate-800 break-words min-w-0">{message}</p>
      </div>
    </Modal>
  );
}
