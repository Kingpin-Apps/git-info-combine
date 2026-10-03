import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout.trim();
}

/**
 * Commits the output folder if anything in it changed, then pushes. Retries
 * once after a rebase if someone else pushed in the meantime.
 * Returns true if a commit was made.
 */
export async function commitAndPush(cwd: string, path: string, message: string, push = true): Promise<boolean> {
  await git(cwd, "add", "--all", "--", path);
  const changed = await git(cwd, "diff", "--cached", "--name-only", "--", path);
  if (!changed) return false;

  await git(
    cwd,
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "--quiet",
    "--message",
    message,
    "--",
    path,
  );
  if (!push) return true;

  try {
    await git(cwd, "push", "--quiet");
  } catch {
    await git(cwd, "pull", "--rebase", "--quiet");
    await git(cwd, "push", "--quiet");
  }
  return true;
}
