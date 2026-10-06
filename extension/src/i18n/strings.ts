/**
 * Extension popup i18n (MVP2 Phase 8 / Q14): en, fr, th.
 * Locale = navigator.language (browser UI language), falling back to en.
 */

export type ExtLocale = "en" | "fr" | "th";

const STRINGS = {
  en: {
    saveTo: "Save to LIKED",
    signInBody: "Sign in to LIKED to save pages to your library.",
    signIn: "Sign in to LIKED",
    signOut: "Sign out",
    advanced: "Advanced (title, description, tags, collection)",
    titleOptional: "Title (optional)",
    descriptionOptional: "Description (optional)",
    descriptionPh: "Why are you saving this?",
    noteOptional: "Personal note (optional)",
    notePh: "Add a personal note about this page…",
    collectionOptional: "Collection (optional)",
    noTagsYet: "No tags yet.",
    tagsOptional: "Tags (optional)",
    addTagPh: "Add a new tag…",
    add: "Add",
    newTags: "New tags",
    alreadySaved: "Already saved — ",
    saved: "Saved ✓ — ",
    openInLiked: "Open in LIKED",
    popupBg: "Popup background",
    bgAuto: "Auto (system)",
    errSignIn: "Please sign in to LIKED.",
    errNetwork: "Unable to reach LIKED.",
    errGeneric: "LIKED could not save this page. Please try again.",
    errBadPage: "This page cannot be saved. Open a web page (http/https) and try again.",
  },
  fr: {
    saveTo: "Enregistrer dans LIKED",
    signInBody: "Connectez-vous à LIKED pour enregistrer des pages.",
    signIn: "Se connecter à LIKED",
    signOut: "Se déconnecter",
    advanced: "Options (titre, description, tags, collection)",
    titleOptional: "Titre (optionnel)",
    descriptionOptional: "Description (optionnelle)",
    descriptionPh: "Pourquoi enregistrez-vous cette page ?",
    noteOptional: "Note personnelle (optionnelle)",
    notePh: "Ajoutez une note sur cette page…",
    collectionOptional: "Collection (optionnelle)",
    noTagsYet: "Aucun tag.",
    tagsOptional: "Tags (optionnels)",
    addTagPh: "Ajouter un tag…",
    add: "Ajouter",
    newTags: "Nouveaux tags",
    alreadySaved: "Déjà enregistré — ",
    saved: "Enregistré ✓ — ",
    openInLiked: "Ouvrir dans LIKED",
    popupBg: "Fond du popup",
    bgAuto: "Auto (système)",
    errSignIn: "Connectez-vous à LIKED.",
    errNetwork: "Impossible de joindre LIKED.",
    errGeneric: "LIKED n'a pas pu enregistrer cette page. Réessayez.",
    errBadPage: "Cette page ne peut pas être enregistrée. Ouvrez une page web (http/https).",
  },
  th: {
    saveTo: "บันทึกลง LIKED",
    signInBody: "ลงชื่อเข้าใช้ LIKED เพื่อบันทึกหน้าเว็บลงคลังของคุณ",
    signIn: "ลงชื่อเข้าใช้ LIKED",
    signOut: "ลงชื่อออก",
    advanced: "ขั้นสูง (ชื่อ, คำอธิบาย, แท็ก, คอลเลกชัน)",
    titleOptional: "ชื่อ (ไม่บังคับ)",
    descriptionOptional: "คำอธิบาย (ไม่บังคับ)",
    descriptionPh: "ทำไมคุณถึงบันทึกหน้านี้?",
    noteOptional: "บันทึกส่วนตัว (ไม่บังคับ)",
    notePh: "เพิ่มบันทึกเกี่ยวกับหน้านี้…",
    collectionOptional: "คอลเลกชัน (ไม่บังคับ)",
    noTagsYet: "ยังไม่มีแท็ก",
    tagsOptional: "แท็ก (ไม่บังคับ)",
    addTagPh: "เพิ่มแท็กใหม่…",
    add: "เพิ่ม",
    newTags: "แท็กใหม่",
    alreadySaved: "บันทึกแล้ว — ",
    saved: "บันทึกแล้ว ✓ — ",
    openInLiked: "เปิดใน LIKED",
    popupBg: "สีพื้นหลังป๊อปอัพ",
    bgAuto: "อัตโนมัติ (ตามระบบ)",
    errSignIn: "โปรดลงชื่อเข้าใช้ LIKED",
    errNetwork: "ไม่สามารถเชื่อมต่อ LIKED",
    errGeneric: "LIKED ไม่สามารถบันทึกหน้านี้ได้ โปรดลองอีกครั้ง",
    errBadPage: "ไม่สามารถบันทึกหน้านี้ได้ เปิดหน้าเว็บ (http/https) แล้วลองอีกครั้ง",
  },
} as const;

export type ExtKey = keyof (typeof STRINGS)["en"];

export function t(key: ExtKey): string {
  const lang = (navigator.language ?? "en").slice(0, 2) as ExtLocale;
  const dict = STRINGS[lang in STRINGS ? lang : "en"];
  return dict[key];
}
