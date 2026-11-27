// V2 home switch (PLAN-V2-002 §8.1 P0-16): where a signed-in visitor to "/"
// is sent. This single constant is the whole switch — reverting it to "/feed"
// in one commit restores the legacy landing behaviour. The legacy app stays
// reachable by URL either way (LINKS-PAUSE).
export const SIGNED_IN_HOME = "/inbox";
