import type { Metadata } from "next";
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
  return (
    <div className="flow-scope dark h-dvh w-full overflow-hidden bg-ink font-sans text-zinc-200">
      {children}
      <UixSwitch />
    </div>
  );
}
