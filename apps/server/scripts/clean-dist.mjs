import { rmSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, "..");
const distPath = resolve(serverRoot, "dist");

if (!distPath.startsWith(`${serverRoot}${sep}`)) {
  throw new Error(`Refusing to remove path outside server workspace: ${distPath}`);
}

rmSync(distPath, { recursive: true, force: true });
