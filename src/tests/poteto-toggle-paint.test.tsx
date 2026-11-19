import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@deepseek-ai/dsh-client-ui-primitives", async () => {
  const React = await import("react");
  const Switch = ({ checked, label }: { checked: boolean; label: string }) =>
    React.createElement("button", {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      "aria-label": label,
    });
  const Button = ({ children, ...rest }: { children?: unknown }) =>
    React.createElement("button", rest, children as never);
  const Tooltip = ({ children }: { children?: unknown }) =>
    React.createElement(React.Fragment, null, children as never);
  return {
    Switch,
    Button,
    Tooltip,
    Toast: () => null,
    IconInfoOutlineRegular: () => null,
    IconWarningTriangleOutlineRegular: () => null,
  };
});

import { PotetoModeToggle } from "../client/components/PotetoModeToggle.tsx";
import { poteto } from "../client/locales/poteto.ts";

/** English copy lookup with `{name}` interpolation, matching the slot's `t` seat. */
function t(key: keyof typeof poteto.en, vars?: Record<string, string | number>): string {
  let text: string = poteto.en[key];
  for (const [name, value] of Object.entries(vars ?? {})) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
}

describe("poteto toggle first paint", () => {
  it("renders the saved on selection on the first pass, with no off frame", () => {
    const html = renderToStaticMarkup(
      <PotetoModeToggle
        sessionId="session-1"
        readMode={async () => true}
        selectMode={async () => null}
        t={t}
        useProjection={
          ((key: string) => (key === "potetoMode" ? { enabled: true } : undefined)) as never
        }
      />,
    );

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });

  it("renders an off selection as off on the first pass", () => {
    const html = renderToStaticMarkup(
      <PotetoModeToggle
        sessionId="session-1"
        readMode={async () => false}
        selectMode={async () => null}
        t={t}
        useProjection={
          ((key: string) => (key === "potetoMode" ? { enabled: false } : undefined)) as never
        }
      />,
    );

    expect(html).toContain('aria-checked="false"');
  });
});
