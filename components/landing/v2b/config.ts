// v2b landing constants (V2-LANDING-002-A). Each is defined ONCE, here.
// Keep out of messages/*.json: messages interpolate it as {email}.

/** TEMPORARY contact address (form notice, FAQ item 5, footer). Replacing it
 *  must stay a one-commit change: edit this line only. */
export const CONTACT_EMAIL = "laurent.martenot@gmail.com";

/** Version of the waitlist notice text shown next to the email field. Posted
 *  as `notice_version`; the server will store it in a later task. */
export const WAITLIST_NOTICE_VERSION = "v1";

/** Existing flows the page links to (no new auth logic). */
export const SIGN_IN_HREF = "/login"; // starts the existing Google sign-in
export const APP_HOME_HREF = "/feed"; // existing authenticated home

/** Legal / help links. /credits and /help do not exist yet (dangling until P0-21). */
export const LEGAL_LINKS = {
  privacy: "/privacy",
  terms: "/terms",
  credits: "/credits",
  help: "/help",
} as const;
