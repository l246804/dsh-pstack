import { buildImage } from "../container/image.ts";

try {
  console.log(`[image] ${buildImage()}`);
} catch (error) {
  console.error(`[image] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
