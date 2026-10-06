import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ActionFlowAnimation,
  ActionFlowScene,
  actionFlowScenes,
} from "./action-flow";

describe("CRM handoff illustration", () => {
  it("keeps the downstream message held through uncertainty and verification", () => {
    for (let step = 0; step < 6; step++) {
      const html = renderToStaticMarkup(
        createElement(ActionFlowScene, { step }),
      );
      expect(html).toContain("Held until safe");
      expect(html).not.toContain("Run verified");
    }
    const uncertain = renderToStaticMarkup(
      createElement(ActionFlowScene, { step: 3 }),
    );
    expect(uncertain).toContain("response is lost");
    expect(uncertain).toContain("Verify before retry");
    const final = renderToStaticMarkup(
      createElement(ActionFlowScene, { step: 6 }),
    );
    expect(final).toContain("separately approved");
    expect(final).toContain("Both effects are checked");
    expect(final).not.toContain("Held until safe");
  });
  it("provides readable text, manual controls and the provider-twin scope", () => {
    const html = renderToStaticMarkup(createElement(ActionFlowAnimation));
    expect(html).toContain("billing and ERP branches are conceptual");
    expect(html).not.toContain("Workflow illustration views");
    expect(html).toContain("ll-horizontal-canvas");
    expect(html).toContain('aria-label="Pause workflow animation"');
    expect(html).toContain('aria-label="Restart workflow illustration"');
    expect(html).toContain("Multiple workflows. Separate authority.");
    expect(actionFlowScenes[1].detail).toContain("cannot approve their own");
  });
});
