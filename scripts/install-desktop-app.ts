import { cpSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") {
  console.error("Desktop app install is only supported on macOS.");
  process.exit(1);
}

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = dirname(thisFile);
const repoRoot = resolve(scriptsDir, "..");
const outputDir = join(repoRoot, "release", "desktop-app");
const buildScript = join(repoRoot, "scripts", "build-desktop-artifact.ts");

rmSync(outputDir, { force: true, recursive: true });

const buildResult = spawnSync(
  process.execPath,
  [buildScript, "--platform", "mac", "--target", "dir", "--output-dir", outputDir],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

function collectAppBundles(rootDir: string): string[] {
  const bundles: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.endsWith(".app")) {
        bundles.push(fullPath);
        continue;
      }
      queue.push(fullPath);
    }
  }

  return bundles;
}

const appBundles = collectAppBundles(outputDir)
  .map((appPath) => ({
    path: appPath,
    mtimeMs: statSync(appPath).mtimeMs,
  }))
  .toSorted((left, right) => right.mtimeMs - left.mtimeMs);

const sourceApp = appBundles[0]?.path;
if (!sourceApp) {
  console.error(`No .app bundle found in ${outputDir}.`);
  process.exit(1);
}

const destinationApp = join("/Applications", "T3 Code (Dev).app");
rmSync(destinationApp, { force: true, recursive: true });
cpSync(sourceApp, destinationApp, { force: true, recursive: true });

console.log(`Installed desktop app to ${destinationApp}`);
