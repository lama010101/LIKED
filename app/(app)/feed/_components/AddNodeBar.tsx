"use client";

// TEMP: replaced by FAB in P5

import { useActionState, useEffect, useRef } from "react";
import { addNode, type AddNodeState } from "../actions";

const initialState: AddNodeState = { error: null, success: false };

export default function AddNodeBar() {
  const [state, formAction, pending] = useActionState(addNode, initialState);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.success && inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [state.success]);

  return (
    <div className="mb-5">
      <form action={formAction} className="flex gap-2">
        <input
          ref={inputRef}
          name="content"
          type="text"
          placeholder="Paste a URL or write a note…"
          disabled={pending}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {state.error && (
        <p className="mt-1.5 text-xs text-red-500">{state.error}</p>
      )}
    </div>
  );
}
