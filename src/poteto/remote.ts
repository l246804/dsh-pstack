/** Remote metadata for the session-scoped poteto-mode switch. */

import type { RemoteResult, TypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol";

import { REMOTE_PACKAGE, codec, directMethod, parameter } from "../lib/typert-method.ts";

/** npm package owning these methods. */
export { REMOTE_PACKAGE };

export const POTETO_SERVICE = "pstackPotetoMode";

const stringValue = (value: unknown): string => {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError("expected a non-empty string");
  return value;
};
const booleanValue = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError("expected a boolean");
  return value;
};
const modeStatus = (value: unknown): { readonly enabled: boolean } => ({
  enabled: booleanValue((value as { enabled?: unknown } | null)?.enabled),
});

const statusMethod = directMethod<{ sessionId: string }, { enabled: boolean }>(POTETO_SERVICE, {
  method: "status",
  parameters: [parameter("sessionId", "PstackSessionId", stringValue)],
  result: codec("PstackPotetoModeStatus", modeStatus),
});
const setMethod = directMethod<{ sessionId: string; enabled: boolean }, { enabled: boolean }>(
  POTETO_SERVICE,
  {
    method: "setEnabled",
    parameters: [
      parameter("sessionId", "PstackSessionId", stringValue),
      parameter("enabled", "PstackPotetoModeEnabled", booleanValue),
    ],
    result: codec("PstackPotetoModeStatus", modeStatus),
    cancellation: true,
  },
);
const getDefaultMethod = directMethod<Record<string, never>, { enabled: boolean }>(POTETO_SERVICE, {
  method: "getDefault",
  parameters: [],
  result: codec("PstackPotetoModeStatus", modeStatus),
});
const setDefaultMethod = directMethod<{ enabled: boolean }, { enabled: boolean }>(POTETO_SERVICE, {
  method: "setDefault",
  parameters: [parameter("enabled", "PstackPotetoModeEnabled", booleanValue)],
  result: codec("PstackPotetoModeStatus", modeStatus),
  cancellation: true,
});
const getAgentTeamDefaultMethod = directMethod<Record<string, never>, { enabled: boolean }>(
  POTETO_SERVICE,
  {
    method: "getAgentTeamDefault",
    parameters: [],
    result: codec("PstackPotetoModeStatus", modeStatus),
  },
);
const setAgentTeamDefaultMethod = directMethod<{ enabled: boolean }, { enabled: boolean }>(
  POTETO_SERVICE,
  {
    method: "setAgentTeamDefault",
    parameters: [parameter("enabled", "PstackPotetoModeEnabled", booleanValue)],
    result: codec("PstackPotetoModeStatus", modeStatus),
    cancellation: true,
  },
);

export interface PstackPotetoModeNamespace {
  readonly pstackPotetoMode: {
    status(sessionId: string): Promise<RemoteResult<{ enabled: boolean }>>;
    setEnabled(
      sessionId: string,
      enabled: boolean,
      signal?: AbortSignal,
    ): Promise<RemoteResult<{ enabled: boolean }>>;
    getDefault(): Promise<RemoteResult<{ enabled: boolean }>>;
    setDefault(enabled: boolean, signal?: AbortSignal): Promise<RemoteResult<{ enabled: boolean }>>;
    getAgentTeamDefault(): Promise<RemoteResult<{ enabled: boolean }>>;
    setAgentTeamDefault(
      enabled: boolean,
      signal?: AbortSignal,
    ): Promise<RemoteResult<{ enabled: boolean }>>;
  };
}

export const pstackPotetoRemote: TypertRemoteInfo = {
  package: REMOTE_PACKAGE,
  descriptors: [
    statusMethod,
    setMethod,
    getDefaultMethod,
    setDefaultMethod,
    getAgentTeamDefaultMethod,
    setAgentTeamDefaultMethod,
  ],
  methods: {
    [`${POTETO_SERVICE}/status`]: statusMethod,
    [`${POTETO_SERVICE}/setEnabled`]: setMethod,
    [`${POTETO_SERVICE}/getDefault`]: getDefaultMethod,
    [`${POTETO_SERVICE}/setDefault`]: setDefaultMethod,
    [`${POTETO_SERVICE}/getAgentTeamDefault`]: getAgentTeamDefaultMethod,
    [`${POTETO_SERVICE}/setAgentTeamDefault`]: setAgentTeamDefaultMethod,
  },
};
