export const PROTOTYPES = {
  desktop: {
    file: "workspace/UI/PROTO V2 - liked_desktop.html",
    label: "Desktop — PROTO V2",
  },
  mobile: {
    file: "workspace/UI/PROTO V2 - liked_mobile.html",
    label: "Mobile — PROTO V2",
  },
  "mobile-full": {
    file: "workspace/mobile_prototype.html",
    label: "Mobile prototype (full)",
  },
} as const;

export type ProtoName = keyof typeof PROTOTYPES;
