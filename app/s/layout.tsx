import type { ReactNode } from "react";
import V2Shell from "@/components/v2/V2Shell";

export default function SLayout({ children }: { children: ReactNode }) {
  return <V2Shell>{children}</V2Shell>;
}
