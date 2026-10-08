import ts from 'typescript';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Deliberately no Vite, tsx or bundler: reproduce per-file native ESM module loading.
const root = resolve('.');
const output = resolve('.cache/native-api');
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|d)\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}
for (const directory of ['api', 'functions', 'server', 'src']) {
  for (const path of await walk(resolve(directory))) {
    const source = await readFile(path, 'utf8');
    const javascript = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: true },
      fileName: path,
    }).outputText;
    const destination = resolve(output, relative(root, path).replace(/\.tsx?$/, '.js'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, javascript);
  }
}
await writeFile(resolve(output, 'package.json'), '{"type":"module"}');
const entries = (await walk(resolve('api'))).map((p) => relative(root, p));
for (const entry of entries) {
  const module = await import(pathToFileURL(resolve(output, entry.replace(/\.ts$/, '.js'))).href);
  assert.equal(typeof module.default, 'function', `${entry} must expose a native handler`);
}
const { handleAiGeneration } = await import(pathToFileURL(resolve(output, 'server/http/ai.js')).href);
const ai = await handleAiGeneration(new Request('https://native-test.example/api/ai/generate-sign'), {});
assert.equal(ai.status, 405);
const { handleSession, handleLogin } = await import(pathToFileURL(resolve(output, 'server/http/auth.js')).href);
assert.equal((await handleSession(new Request('https://native-test.example/api/auth/session'), {})).status, 503);
assert.equal((await handleLogin(new Request('https://native-test.example/api/auth/login'), {})).status, 405);
console.info(`Native Node ESM smoke: ${entries.length} API modules loaded; AI/auth handlers responded; no provider request made.`);
