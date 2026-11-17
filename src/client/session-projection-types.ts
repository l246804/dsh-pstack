/**
 * Client-side `useProjection` typing for session-scope slots.
 *
 * DSH serves this standard session prop at runtime through its ui-session
 * plugin, but that package is not part of this workspace's type catalog, so the
 * slot interface arrives here without it. Declare the same signature the runtime
 * serves, keyed by the official projection type table.
 */

import type { SessionProjectionMap } from "@deepseek-ai/dsh-session-projection/types";

type StringProjectionKey = Extract<keyof SessionProjectionMap, string>;

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SessionStandardProps {
    useProjection: {
      <K extends StringProjectionKey>(key: K): SessionProjectionMap[K] | undefined;
      <K extends StringProjectionKey, S>(
        key: K,
        selector: (value: SessionProjectionMap[K] | undefined) => S,
        eq?: (a: S, b: S) => boolean,
      ): S;
    };
  }
}
