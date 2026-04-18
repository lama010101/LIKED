"use client";

import type { VisibleNode } from "@/lib/db/visibility";

interface NodeCardProps {
  node: VisibleNode;
  onClick: (node: VisibleNode) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function NodeCard({ node, onClick }: NodeCardProps) {
  const isTextCard = !node.url && !!node.text_content;

  return (
    <button
      type="button"
      onClick={() => onClick(node)}
      className="w-full text-left bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-150 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer"
    >
      {/* Thumbnail area */}
      {!isTextCard && (
        <div className="w-full bg-gray-100 aspect-video flex items-center justify-center">
          {node.thumbnail_key ? (
            /* Real thumbnail would be resolved via storage URL — placeholder for now */
            <div className="w-full h-full bg-gray-200" />
          ) : (
            <div className="w-full h-full bg-[#EAE8E3] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 19.5h18a.75.75 0 0 0 .75-.75v-15A.75.75 0 0 0 21 3H3a.75.75 0 0 0-.75.75v15c0 .414.336.75.75.75Z"
                />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Text card body (no image area) */}
      {isTextCard && (
        <div className="px-4 pt-4 pb-1 bg-[#F8F6F2]">
          <p className="text-sm text-gray-700 line-clamp-4 leading-relaxed">
            {node.text_content}
          </p>
        </div>
      )}

      {/* Card footer */}
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900 truncate leading-snug">
          {node.title ?? (isTextCard ? "Text note" : "Untitled")}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDate(node.created_at)}
        </p>
      </div>
    </button>
  );
}
