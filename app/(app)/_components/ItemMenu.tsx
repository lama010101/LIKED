"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Modal from "./Modal";

export interface ItemMenuAction {
  key: string;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

/** ⋯ corner menu for cards / folder tiles → modal action list.
 *  The dialog is portaled to <body>: .card/.folder-tile clip overflow and
 *  the trigger often lives inside an enclosing <Link>, whose default
 *  navigation must never fire for menu clicks. */
export default function ItemMenu({ title, actions }: { title: string; actions: ItemMenuAction[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="menu-btn"
        aria-label={t("menu.open")}
        title={t("menu.open")}
        draggable={false}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      >
        ⋯
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <Modal open onClose={() => setOpen(false)} title={title}>
          <div className="menu-list">
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`menu-item${a.danger ? " danger" : ""}`}
                onClick={() => { setOpen(false); a.onSelect(); }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Modal>,
        document.body
      )}
    </>
  );
}
