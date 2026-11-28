import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { openPage, startSession } from "../runner/browser/page.ts";
import type { BrowserSession } from "../runner/browser/session.ts";

const windows: Window[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(windows.splice(0).map((window) => window.happyDOM.close()));
});

function page(onOpen: (window: Window) => void, onWait: (window: Window) => void = () => {}) {
  const window = new Window();
  windows.push(window);
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const session: BrowserSession = {
    raw: () => "",
    open: () => {
      onOpen(window);
      return "";
    },
    wait: (value) => {
      now += Number(value);
      onWait(window);
      return "";
    },
    eval: <T>(expression: string): T => window.eval(expression) as T,
    click: () => "",
    keyboardType: () => "",
    press: () => "",
    setViewport: () => "",
    screenshot: () => "",
    close: () => {},
  };
  return { session, window, elapsed: () => now };
}

describe("DSH page readiness", () => {
  it("continues immediately when the composer is already available", () => {
    const fixture = page((window) => {
      window.document.body.innerHTML = '<div data-composer-input="true"></div>';
    });
    openPage(fixture.session, "http://worker");
    expect(fixture.elapsed()).toBe(0);
  });

  it("waits for the preview notice, dismisses it, then waits for the composer", () => {
    let waits = 0;
    let dismissed = false;
    const fixture = page(
      () => {},
      (window) => {
        waits += 1;
        if (waits === 2) {
          window.document.body.innerHTML = "<p>预览版说明</p><button>继续</button>";
          window.document.querySelector("button")!.addEventListener("click", () => {
            dismissed = true;
            window.document.body.innerHTML = "";
          });
        }
        if (dismissed) window.document.body.innerHTML = '<div data-composer-input="true"></div>';
      },
    );
    openPage(fixture.session, "http://worker");
    expect(dismissed).toBe(true);
    expect(fixture.window.document.querySelector("[data-composer-input]")).not.toBeNull();
    expect(fixture.elapsed()).toBeLessThan(1000);
  });

  it("reports a page that never becomes ready instead of continuing blindly", () => {
    const fixture = page((window) => {
      window.document.body.textContent = "Loading";
    });
    expect(() => openPage(fixture.session, "http://worker")).toThrow(
      "DSH page did not become ready",
    );
    expect(fixture.elapsed()).toBe(15_000);
  });

  it("starts a session in the selected workspace without opening its actions menu", () => {
    const fixture = page(() => {});
    fixture.window.document.body.innerHTML = `
      <div data-row-key="workspace:first">first<button>actions</button><button aria-keyshortcuts="N">new</button></div>
      <div data-row-key="workspace:chosen">chosen<button>actions</button><button aria-keyshortcuts="N">new</button></div>
      <button>新会话</button>`;
    const clicked: string[] = [];
    for (const button of fixture.window.document.querySelectorAll("button")) {
      button.addEventListener("click", () =>
        clicked.push(`${button.parentElement?.getAttribute("data-row-key")}:${button.textContent}`),
      );
    }
    startSession(fixture.session, "chosen");
    expect(clicked).toEqual(["workspace:chosen:new"]);
  });
});
