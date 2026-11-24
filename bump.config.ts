import { resolve } from "node:path";

import { defineConfig } from "bumpp";

import {
  COMPATIBILITY_FILES,
  releaseMetadata,
  syncCompatibility,
} from "./scripts/release-compatibility.ts";

/** Sync the bilingual compatibility tables and pstack badges after the bump and before the release commit. */
export default defineConfig({
  files: ["package.json"],
  execute: (operation) => {
    const metadata = releaseMetadata();
    const result = syncCompatibility(metadata);
    const updatedFiles = new Set(operation.state.updatedFiles);
    for (const file of COMPATIBILITY_FILES) updatedFiles.add(resolve(file));
    operation.update({ updatedFiles: [...updatedFiles] });
    console.log(
      `${result.addedRow ? "Added" : "Updated"} compatibility group for DSH ${metadata.dshRange}: ${result.releases.join("、")}.`,
    );
  },
});
