// String attributes and routes for the v2 settings screens. The repo's
// react/jsx-no-literals (noStrings) rule rejects string literals in JSX
// attributes inside app/settings/** and components/v2/**, so every fixed
// value lives here.

export const UI = {
  button: "button",
  checkbox: "checkbox",
  radio: "radio",
  switch: "switch",
  radiogroup: "radiogroup",
  true: "true",
  false: "false",
  empty: "",
  chevron: "›",
  external: "noopener noreferrer",
  blank: "_blank",
  languageGroup: "settings-language",
  current: "page",
} as const;

export const ROUTES = {
  inbox: "/inbox",
  me: "/me",
  privacy: "/privacy",
  terms: "/terms",
  settings: "/settings",
  credits: "/settings/credits",
  tmdbLogo: "/brand/tmdb-blue-long.svg",
  signout: "/api/auth/signout",
  login: "/login",
  help: "mailto:privacy@liked.app",
} as const;

// P0-19: the "Delete account" row stays hidden until app/settings/delete
// exists (owned by the account-deletion task). Flip to true in one commit.
export const DELETE_ACCOUNT_ENABLED = false;

export const SECTION = {
  account: "settings-account",
  preferences: "settings-preferences",
  notifications: "settings-notifications",
  about: "settings-about",
  session: "settings-session",
  danger: "settings-danger",
} as const;

export const TESTID = {
  page: "settings-page",
  languageOption: "settings-language-option",
  regionInput: "settings-region-input",
  regionSave: "settings-region-save",
  regionUse: "settings-region-use",
  regionSuggested: "settings-region-suggested",
  emailToggle: "settings-email-toggle",
  signOut: "settings-signout",
  creditsLink: "settings-credits-link",
  version: "settings-version",
  deleteRow: "settings-delete-account",
  creditsPage: "credits-page",
} as const;
