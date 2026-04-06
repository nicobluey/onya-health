import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.SITEMAP_BASE_URL || 'https://www.onyahealth.com.au';
const ROOT = process.cwd();
const topicSource = path.join(ROOT, 'frontend/src/pages/HealthTopicLandingPage.tsx');
const sitemapPath = path.join(ROOT, 'frontend/public/sitemap.xml');

const staticRoutes = [
  '/',
  '/doctor',
  '/student',
  '/caretaker',
  '/work',
  '/nutritionist',
  '/psychologist',
  '/patient-login',
  '/patient',
  '/verify',
  '/about',
  '/blog',
  '/health',
  '/fair-work-medical-certificates',
];

function normalize(route) {
  if (!route.startsWith('/')) return `/${route}`;
  return route;
}

function buildXml(routes) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map((route) => `  <url>\n    <loc>${BASE_URL}${route}</loc>\n  </url>`),
    '</urlset>',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const source = await fs.readFile(topicSource, 'utf8');
  const slugMatches = [...source.matchAll(/slug:\s*'([^']+)'/g)];
  const topicRoutes = slugMatches.map((match) => `/health/${match[1]}`);

  const routes = [...new Set([...staticRoutes, ...topicRoutes].map(normalize))];
  routes.sort((a, b) => a.localeCompare(b));

  const xml = buildXml(routes);
  await fs.writeFile(sitemapPath, xml, 'utf8');

  console.log(`Generated sitemap with ${routes.length} URLs at ${sitemapPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
