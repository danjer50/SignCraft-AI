#!/usr/bin/env node
/**
 * Provisioning helper: turns a password into the PBKDF2 hash the server accepts.
 *
 * The password is read from stdin — never from an argument — so it does not land in shell history,
 * in a process list or in a log. Only the hash is printed. Nothing in this repository contains a
 * real credential, and the owner account only exists once the operator pastes the result into the
 * deployment environment.
 *
 *   npm run hash-password                     (typed input, hidden)
 *   printf %s "$PASS" | npm run hash-password (piped input)
 *
 * The parameters must match server/auth/passwords.ts: PBKDF2-HMAC-SHA256, 210 000 iterations,
 * 16-byte salt, 256-bit key, encoded as `pbkdf2-sha256$<iterations>$<salt>$<hash>`.
 */
import { webcrypto } from 'node:crypto';
import readline from 'node:readline';

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const MIN_LENGTH = 10;
const MAX_LENGTH = 256;

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function readPassword() {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let prompted = false;
    // Hide the typed characters: the prompt is written once, keystrokes are swallowed.
    rl._writeToOutput = (value) => {
      if (!prompted) {
        rl.output.write(value);
        prompted = true;
        return;
      }
      if (value === '\r\n') rl.output.write('\r\n');
    };
    rl.question('Password (input is hidden): ');
    return new Promise((resolve) => {
      rl.once('line', (line) => {
        rl.close();
        resolve(String(line).replace(/\r?\n$/, ''));
      });
    });
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const password = await readPassword();

  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    process.stderr.write(`Refused: the password must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters.\n`);
    process.exitCode = 1;
    return;
  }

  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    KEY_BITS,
  );
  const hash = `pbkdf2-sha256$${ITERATIONS}$${base64(salt)}$${base64(new Uint8Array(bits))}`;

  // dotenv-style loaders expand `$NAME`; a hash is full of `$`, so a .env file needs it escaped.
  const envFileHash = hash.replaceAll('$', '\\$');

  process.stdout.write(`\n${hash}\n\n`);
  process.stdout.write('Set this on the deployment (never in the repository, never with a VITE_ prefix):\n');
  process.stdout.write(`  AUTH_OWNER_PASSWORD_HASH=${hash}\n`);
  process.stdout.write('Also required for sessions:\n');
  process.stdout.write('  AUTH_SESSION_SECRET=<at least 32 random characters>\n');
  process.stdout.write('  AUTH_OWNER_EMAIL=<owner email>   (or AUTH_OWNER_USERNAME)\n');
  process.stdout.write('\nGenerate a session secret with:\n');
  process.stdout.write('  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"\n');
  process.stdout.write('\nFor a local .env file only, escape every $ so dotenv does not expand it:\n');
  process.stdout.write(`  AUTH_OWNER_PASSWORD_HASH='${envFileHash}'\n`);
}

await main();
