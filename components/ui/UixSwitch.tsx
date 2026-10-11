"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating chip to switch between the LIKED UI (/feed…) and the
 * alternative Flow UIX (/flow). Rendered by both layout trees.
 */
export default function UixSwitch() {
  const pathname = usePathname();
  const onFlow = pathname.startsWith("/flow");
  return (
    <Link
      href={onFlow ? "/feed" : "/flow"}
      title={onFlow ? "Switch to LIKED UI" : "Switch to Flow UIX"}
      className="fixed bottom-4 left-4 z-[80] rounded-full border border-white/15 bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:bg-black"
    >
      {onFlow ? "← LIKED UI" : "Flow UIX →"}
    </Link>
  );
}
