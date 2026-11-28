// Pure state machine for the owner "Manage {name}" sheet (PRD §10.1,
// migration 155). Kept render-free so the transitions are unit-testable;
// the sheet component is a thin shell over these states.

export type ManageActionKind = "remove" | "block";

export type ManageStep =
  | { name: "menu" }
  | { name: "confirm"; action: ManageActionKind }
  | { name: "busy"; action: ManageActionKind }
  | { name: "error"; action: ManageActionKind; message: string };

export type ManageEvent =
  | { type: "choose"; action: ManageActionKind }
  | { type: "back" }
  | { type: "confirm" }
  | { type: "success" }
  | { type: "fail"; message: string };

export const MANAGE_MENU: ManageStep = { name: "menu" };

/** menu -> confirm(action) -> busy -> (closed on success | error -> back).
 *  Any event not meaningful for the current step is ignored so the sheet
 *  can never end up in an inconsistent state. */
export function manageStep(step: ManageStep, event: ManageEvent): ManageStep | null {
  switch (event.type) {
    case "choose":
      return step.name === "menu" ? { name: "confirm", action: event.action } : step;
    case "back":
      return step.name === "confirm" || step.name === "error" ? MANAGE_MENU : step;
    case "confirm":
      return step.name === "confirm" || step.name === "error"
        ? { name: "busy", action: step.action }
        : step;
    case "success":
      // null = the sheet closes; the parent refreshes rail + inbox.
      return step.name === "busy" ? null : step;
    case "fail":
      return step.name === "busy"
        ? { name: "error", action: step.action, message: event.message }
        : step;
    default:
      return step;
  }
}
