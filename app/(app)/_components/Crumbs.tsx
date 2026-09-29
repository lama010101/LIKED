"use client";

import Link from "next/link";

/** Breadcrumb trail — same markup/style as the folder page's .crumbs nav. */
export default function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="crumbs" aria-label="breadcrumb">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && " / "}
          {it.href ? <Link href={it.href}>{it.label}</Link> : it.label}
        </span>
      ))}
    </nav>
  );
}
