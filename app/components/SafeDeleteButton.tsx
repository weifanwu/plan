"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> & {
  onConfirm: () => void;
  confirmLabel?: ReactNode;
};

/**
 * Desktop keeps the fast one-click workflow. Touch devices require a deliberate
 * second tap, which prevents a stray thumb from deleting data next to Edit/Done.
 */
export default function SafeDeleteButton({
  onConfirm,
  confirmLabel = "再点确认",
  children,
  className = "",
  ...props
}: Props) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (!coarsePointer) {
      onConfirm();
      return;
    }
    if (armed) {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timerRef.current = window.setTimeout(() => setArmed(false), 2600);
  }

  return (
    <button
      {...props}
      type="button"
      className={`${className} safe-delete-button${armed ? " armed" : ""}`.trim()}
      data-touch-confirm={armed ? "armed" : "idle"}
      aria-pressed={armed}
      onClick={handleClick}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
