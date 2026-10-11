"use client";

import { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  fullScreen?: boolean;
  children: ReactNode;
}

/** Mobile bottom sheet / full-screen modal with drag-to-dismiss. */
export default function BottomSheet({
  open,
  onClose,
  title,
  fullScreen = false,
  children,
}: BottomSheetProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60"
            aria-hidden
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title ?? "Sheet"}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={
              reduce
                ? { duration: 0.12 }
                : { type: "spring", damping: 30, stiffness: 350 }
            }
            drag={reduce || fullScreen ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className={`fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden border-t border-edge bg-panel ${
              fullScreen ? "top-0 rounded-none" : "top-[8dvh] rounded-t-2xl"
            }`}
          >
            {!fullScreen && (
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-faint" aria-hidden />
            )}
            {title && (
              <div className="flex items-center justify-between border-b border-edge px-4 py-2">
                <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200"
                >
                  <svg viewBox="0 0 12 12" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.5">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
