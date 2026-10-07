// @vitest-environment node
import { execFile } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { promisify } from 'node:util';
import { isPasswordHash, verifyPassword } from './passwords.js';

const run = promisify(execFile);

/**
 * The provisioning helper is part of the security story: an operator must be able to create the
 * owner account without a password ever appearing in the repository, a commit message, a log or a
 * response. These cases run the real script with an obviously fake fixture password delivered on
 * stdin (never as an argument) and prove the server accepts the hash it prints.
 */
const FIXTURE_PASSWORD = 'fixture-only-provisioning-password';

interface ScriptRun {
  stdout: string;
  stderr: string;
}

/** Pipes the password to the script and resolves with whatever it printed. */
async function hashScript(password: string): Promise<ScriptRun> {
  const pending = run(process.execPath, ['scripts/hash-password.mjs'], { cwd: process.cwd(), timeout: 60_000 });
  pending.child.stdin?.end(password);
  try {
    const { stdout, stderr } = await pending;
    return { stdout, stderr };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

function hashFrom(stdout: string): string | undefined {
  return stdout.split('\n').map((entry) => entry.trim()).find((entry) => entry.startsWith('pbkdf2-sha256$'));
}

describe('npm run hash-password (owner provisioning)', () => {
  it('prints a PBKDF2 hash that the server verifier accepts', async () => {
    const { stdout } = await hashScript(FIXTURE_PASSWORD);

    // The password is only ever on stdin: it must not come back in the output.
    expect(stdout).not.toContain(FIXTURE_PASSWORD);
    const hash = hashFrom(stdout);
    expect(hash).toBeTruthy();
    expect(isPasswordHash(hash)).toBe(true);

    expect(await verifyPassword(FIXTURE_PASSWORD, hash as string)).toBe(true);
    expect(await verifyPassword('a-completely-different-fixture-password', hash as string)).toBe(false);
    expect(stdout).toContain('AUTH_OWNER_PASSWORD_HASH=');
  }, 90_000);

  it('refuses a password that is too weak to protect an account', async () => {
    const { stdout, stderr } = await hashScript('1234');

    expect(`${stdout}${stderr}`).toMatch(/between 10 and 256 characters/);
    expect(hashFrom(stdout)).toBeUndefined();
  }, 90_000);

  it('produces a different hash on every run (unique salt)', async () => {
    const first = hashFrom((await hashScript(FIXTURE_PASSWORD)).stdout) as string;
    const second = hashFrom((await hashScript(FIXTURE_PASSWORD)).stdout) as string;

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
    expect(await verifyPassword(FIXTURE_PASSWORD, second)).toBe(true);
  }, 120_000);
});
