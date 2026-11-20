import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/flow/flow.css";
import UixSwitch from "@/components/ui/UixSwitch";

export const metadata: Metadata = {
  title: "Flow UIX",
};

export default function FlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NEXT_PUBLIC_SHOW_FLOW !== "1") notFound();
  return (
    <div className="flow-scope dark h-dvh w-full overflow-hidden bg-ink font-sans text-zinc-200">
      {children}
      <UixSwitch />
    </div>
  );
}
