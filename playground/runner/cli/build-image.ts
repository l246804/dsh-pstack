import { buildImage } from "../container/image.ts";
import { DEFAULT_CONFIG_FILE as CONFIG_FILE } from "../shared/paths.ts";
import { readRuntimeConfig } from "../config/config.ts";

await readRuntimeConfig(CONFIG_FILE);

try {
  console.log(`[image] ${buildImage()}`);
} catch (error) {
  console.error(`[image] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
