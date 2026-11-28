/**
 * A discard confirmation built from the DSH `Modal` primitive.
 *
 * Callers ask before discarding unsaved edits on a navigation or reload.
 */

import { useCallback, useState, type ReactElement } from "react";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";

import { Button } from "./ui.tsx";

export interface DiscardConfirmationLabels {
  readonly title: string;
  readonly description: string;
  readonly cancel: string;
  readonly close: string;
  readonly confirm: string;
}

export interface DiscardConfirmation {
  /** Run the action after the user confirms; shows the dialog first. */
  readonly request: (action: () => void) => void;
  readonly dialog: ReactElement | null;
}

/** Track one pending discard action and render its confirmation dialog. */
export function useDiscardConfirm(labels: DiscardConfirmationLabels): DiscardConfirmation {
  const [pending, setPending] = useState<(() => void) | undefined>(undefined);

  const request = useCallback((action: () => void) => {
    setPending(() => action);
  }, []);

  const cancel = useCallback(() => {
    setPending(undefined);
  }, []);

  const confirm = useCallback(() => {
    const action = pending;
    setPending(undefined);
    action?.();
  }, [pending]);

  const dialog =
    pending === undefined ? null : (
      <Modal
        open
        tone="warning"
        title={labels.title}
        description={labels.description}
        closeLabel={labels.close}
        onClose={cancel}
        className="pstack-discard-panel"
        footer={
          <>
            <Button variant="outline" onClick={cancel}>
              {labels.cancel}
            </Button>
            <Button variant="primary" className="pstack-discard-confirm" onClick={confirm}>
              {labels.confirm}
            </Button>
          </>
        }
      />
    );

  return { request, dialog };
}
