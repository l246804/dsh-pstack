/** Shared client state for the poteto-workflow switch and its header badge. */

import { useCallback, useEffect, useState } from "react";

/** Browser event carrying one Session's live switch change. */
export const POTETO_MODE_EVENT = "pstack-poteto-mode-change";

/** Slot props shared by the switch and the badge. */
export interface PotetoModeInjected {
  readonly sessionId: string;
  readonly readMode: () => Promise<boolean>;
}

/**
 * Read one Session's switch and keep it in step with the shared browser event.
 * The projection supplies first paint; this hook supplies the authoritative
 * answer once the Host responds and every later toggle.
 */
export function usePotetoMode(
  sessionId: string,
  readMode: () => Promise<boolean>,
): { mode: boolean | undefined; setMode: (enabled: boolean) => void } {
  const [selected, setSelected] = useState<boolean | undefined>();

  useEffect(() => {
    let live = true;
    let changed = false;
    void readMode().then(
      (value) => {
        if (live && !changed) setSelected(value);
      },
      () => undefined,
    );
    const onChange = (event: Event): void => {
      const detail = (event as CustomEvent<{ sessionId: string; enabled: boolean }>).detail;
      if (detail.sessionId === sessionId) {
        changed = true;
        setSelected(detail.enabled);
      }
    };
    window.addEventListener(POTETO_MODE_EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(POTETO_MODE_EVENT, onChange);
    };
  }, [readMode, sessionId]);

  const setMode = useCallback(
    (enabled: boolean): void => {
      setSelected(enabled);
      window.dispatchEvent(new CustomEvent(POTETO_MODE_EVENT, { detail: { sessionId, enabled } }));
    },
    [sessionId],
  );

  return { mode: selected, setMode };
}
