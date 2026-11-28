import { describe, expect, it } from "vitest";
import { MANAGE_MENU, manageStep } from "./manage-utils";

describe("manage sheet state machine", () => {
  it("menu -> confirm -> busy -> closed on success", () => {
    const confirm = manageStep(MANAGE_MENU, { type: "choose", action: "remove" });
    expect(confirm).toEqual({ name: "confirm", action: "remove" });
    const busy = manageStep(confirm!, { type: "confirm" });
    expect(busy).toEqual({ name: "busy", action: "remove" });
    expect(manageStep(busy!, { type: "success" })).toBeNull();
  });

  it("confirm step states exactly which action is pending", () => {
    expect(manageStep(MANAGE_MENU, { type: "choose", action: "block" })).toEqual({
      name: "confirm",
      action: "block",
    });
  });

  it("back from confirm returns to the menu without side effects", () => {
    const confirm = manageStep(MANAGE_MENU, { type: "choose", action: "block" });
    expect(manageStep(confirm!, { type: "back" })).toEqual(MANAGE_MENU);
  });

  it("a failure lands on the error step and can be retried or dismissed", () => {
    const confirm = manageStep(MANAGE_MENU, { type: "choose", action: "remove" });
    const busy = manageStep(confirm!, { type: "confirm" });
    const err = manageStep(busy!, { type: "fail", message: "NOT_FOUND" });
    expect(err).toEqual({ name: "error", action: "remove", message: "NOT_FOUND" });
    expect(manageStep(err!, { type: "confirm" })).toEqual({ name: "busy", action: "remove" });
    expect(manageStep(err!, { type: "back" })).toEqual(MANAGE_MENU);
  });

  it("ignores events that are meaningless for the current step", () => {
    expect(manageStep(MANAGE_MENU, { type: "confirm" })).toEqual(MANAGE_MENU);
    expect(manageStep(MANAGE_MENU, { type: "success" })).toEqual(MANAGE_MENU);
    const busy = manageStep(
      manageStep(MANAGE_MENU, { type: "choose", action: "remove" })!,
      { type: "confirm" }
    );
    expect(manageStep(busy!, { type: "choose", action: "block" })).toEqual(busy);
    expect(manageStep(busy!, { type: "back" })).toEqual(busy);
  });
});
