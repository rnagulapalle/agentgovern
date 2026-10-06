import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HorizontalFlowScene } from "./horizontal-flow";

describe("single horizontal hero", () => {
  const render = (step: number, paused = false) => renderToStaticMarkup(createElement(HorizontalFlowScene, { step, paused, onInspect: () => {} }));
  it("shows one compact diagram with inspectable systems", () => {
    const html = render(0);
    expect(html.match(/ll-horizontal-canvas/g)).toHaveLength(1);
    for (const system of ["CRM", "Messaging", "Billing", "ERP"])
      expect(html).toContain(`aria-label="Inspect ${system}:`);
    expect(html).toContain("Show LoopLabs control decision");
  });
  it("never animates held or blocked execution and separates the approvals", () => {
    for (const step of [0, 1, 3, 4, 5]) expect(render(step)).not.toContain("ll-horizontal-dispatch");
    for (const step of [2, 6]) expect(render(step).match(/ll-horizontal-dispatch/g)).toHaveLength(5);
    expect(render(5)).toContain("Separate approval required");
  });
  it("shows readback only during verification and preserves pause", () => {
    expect(render(3)).not.toContain("ll-horizontal-evidence");
    expect(render(4, true)).toContain("ll-horizontal-evidence");
    expect(render(4, true)).toContain("is-paused");
    expect(render(6)).not.toContain("ll-horizontal-evidence");
  });
});
