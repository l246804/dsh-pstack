/** Browser-safe composition of the plugin's Remote namespaces. */
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry";
import type { TypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol";
import { REMOTE_PACKAGE } from "../lib/typert-method.ts";
import { pstackRolesRemote } from "../roles/role-remote.ts";
import { pstackPotetoRemote } from "../poteto/remote.ts";
import { pstackPotetoMaintenanceRemote } from "../poteto/maintenance-remote.ts";

const remotes = [pstackRolesRemote, pstackPotetoRemote, pstackPotetoMaintenanceRemote];
export const pstackClientRemote: TypertRemoteInfo = {
  package: REMOTE_PACKAGE,
  descriptors: remotes.flatMap((remote) => remote.descriptors),
  methods: {
    ...pstackRolesRemote.methods,
    ...pstackPotetoRemote.methods,
    ...pstackPotetoMaintenanceRemote.methods,
  },
};

/** Typert permits one Host face per package, registered by the plugin root. */
export const pstackHostContribution: TypertContribution = {
  package: REMOTE_PACKAGE,
  face: "host",
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: pstackClientRemote.descriptors,
};
