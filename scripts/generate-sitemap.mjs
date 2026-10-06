import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const siteUrl = process.env.SITE_URL?.trim().replace(/\/$/, '');
if (!siteUrl) {
  console.info('SITE_URL is not set; sitemap generation skipped.');
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(siteUrl);
} catch {
  console.error('SITE_URL must be an absolute HTTPS URL.');
  process.exit(1);
}
if (parsed.protocol !== 'https:') {
  console.error('SITE_URL must use HTTPS.');
  process.exit(1);
}

const routes = ['/', '/studio', '/professional'];
const urls = routes.map((route) => `  <url><loc>${siteUrl}${route}</loc></url>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
const outputDir = resolve('dist');
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'sitemap.xml'), sitemap, 'utf8');
console.info(`Generated dist/sitemap.xml for ${siteUrl}`);
