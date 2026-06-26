import fs from "node:fs";
import path from "node:path";

const cloudDir = path.resolve(import.meta.dirname, "..");
const rootDir = path.resolve(cloudDir, "..");
const cloudNodeModules = path.join(cloudDir, "node_modules");

function ensureSymlink(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  try {
    const current = fs.lstatSync(linkPath);
    if (current.isSymbolicLink() && fs.realpathSync(linkPath) === fs.realpathSync(target)) {
      return;
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  fs.symlinkSync(target, linkPath, "dir");
}

ensureSymlink(
  path.join(cloudNodeModules, "zod"),
  path.join(rootDir, "packages", "shared", "node_modules", "zod")
);

ensureSymlink(
  path.join(rootDir, "packages", "shared"),
  path.join(rootDir, "packages", "backend-core", "node_modules", "@wfb", "shared")
);
