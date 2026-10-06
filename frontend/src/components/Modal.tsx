import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

const Modal = ({ open, onClose, children }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box">
        <button
          type="button"
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>
        {children}
      </div>
      {/* 背景クリックで閉じる */}
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
};

export default Modal;
