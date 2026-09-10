// Installs the repo-tracked git hooks from scripts/hooks/ into .git/hooks/.
// Runs automatically on `npm install` via the `prepare` script in package.json.
// Safe to run repeatedly (overwrites existing hooks of the same name).

import { copyFileSync, chmodSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "scripts", "hooks");
const destDir = join(root, ".git", "hooks");

// Resolve the .git directory (handles worktrees / submodules gracefully).
let gitDir = destDir;
if (!existsSync(join(root, ".git"))) {
  // Not a regular .git dir (could be a worktree gitdir file). Skip silently.
  console.log("prepare: no .git directory found, skipping hook install.");
  process.exit(0);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

const hooks = ["pre-commit"];
for (const name of hooks) {
  const src = join(srcDir, name);
  const dest = join(destDir, name);
  if (!existsSync(src)) continue;
  copyFileSync(src, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // chmod may fail on Windows without POSIX perms; git still runs the hook.
  }
  console.log(`prepare: installed hook ${name} -> .git/hooks/${name}`);
}
