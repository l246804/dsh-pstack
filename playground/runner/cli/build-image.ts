import { buildImage } from "../container/image.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";

await readPlaygroundConfig(CONFIG_FILE);

try {
  console.log(`[image] ${buildImage()}`);
} catch (error) {
  console.error(`[image] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
