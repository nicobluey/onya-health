#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://dietitiansaustralia.org.au';
const INDEX_PATH = '/health-advice/recipes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'dietitians-australia-recipes');
const OUT_JSON = path.join(OUT_DIR, 'recipes.json');
const OUT_CSV = path.join(OUT_DIR, 'recipes.csv');
const OUT_META = path.join(OUT_DIR, 'crawl-metadata.json');
const MAX_LIST_PAGES = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function absoluteUrl(urlOrPath) {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) return urlOrPath;
  return new URL(urlOrPath, BASE_URL).toString();
}

function stripTags(input) {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function fetchHtml(url, { retries = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': 'OnyaHealth Recipe Research Bot/1.0 (+https://onyahealth)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(800 * attempt);
    }
  }
  throw lastError;
}

function getSelectOptions(html, selectName) {
  const selectRegex = new RegExp(`<select[^>]*name="${selectName}"[^>]*>([\\s\\S]*?)<\\/select>`, 'i');
  const selectMatch = html.match(selectRegex);
  if (!selectMatch) return [];

  const options = [];
  const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;
  let match = optionRegex.exec(selectMatch[1]);
  while (match) {
    const value = (match[1] || '').trim();
    const label = stripTags(match[2] || '');
    if (value && value !== 'All' && label) {
      options.push({ value, label });
    }
    match = optionRegex.exec(selectMatch[1]);
  }
  return options;
}

function extractRecipeCardLinks(html) {
  const links = new Set();
  const recipeLinkRegex = /<div class="h4 card-title\s*">\s*<a href="([^"]*\/recipes\/[^"?#]+)(?:[^"]*)"/gi;
  let match = recipeLinkRegex.exec(html);
  while (match) {
    links.add(absoluteUrl(match[1].split('?')[0]));
    match = recipeLinkRegex.exec(html);
  }
  return Array.from(links);
}

function parseMetric(html, label) {
  const regex = new RegExp(`${label}<\\/div>\\s*([^<\\n]+)`, 'i');
  const match = html.match(regex);
  return match ? stripTags(match[1]) : '';
}

function parseTabContent(html, tabId) {
  const regex = new RegExp(`<div[^>]*id="${tabId}"[^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/div>`, 'i');
  const match = html.match(regex);
  return match ? match[1] : '';
}

function parseIngredients(html) {
  const block =
    (html.match(/<div[^>]*id="nav-ingredients"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i) || [])[1] ||
    parseTabContent(html, 'nav-ingredients');
  const rows = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match = tdRegex.exec(block);
  while (match) {
    const text = stripTags(match[1]);
    if (text) rows.push(text);
    match = tdRegex.exec(block);
  }
  return rows;
}

function parseMethod(html) {
  const block =
    (html.match(/<div[^>]*id="nav-method"[^>]*>[\s\S]*?<ol[^>]*>([\s\S]*?)<\/ol>/i) || [])[1] ||
    parseTabContent(html, 'nav-method');
  const steps = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match = liRegex.exec(block);
  while (match) {
    const text = stripTags(match[1]);
    if (text) steps.push(text);
    match = liRegex.exec(block);
  }
  return steps;
}

function parseNutrition(html) {
  const block =
    (html.match(/<div[^>]*id="nav-nutrition"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i) || [])[1] ||
    parseTabContent(html, 'nav-nutrition');
  const nutrition = {};
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch = trRegex.exec(block);
  while (trMatch) {
    const row = trMatch[1];
    // Handles malformed rows like <td>Protein<td>18g by splitting on opening td tags.
    const cells = row
      .split(/<td[^>]*>/i)
      .slice(1)
      .map((segment) => stripTags(segment.replace(/<\/td>/gi, '')))
      .filter(Boolean);
    if (cells.length >= 2) nutrition[cells[0]] = cells[1];
    trMatch = trRegex.exec(block);
  }
  return nutrition;
}

function parseRecipeTagsFromListing(html, recipePath) {
  const escapedPath = recipePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRegex = new RegExp(`<div class="h4 card-title\\s*">\\s*<a href="${escapedPath}"[\\s\\S]*?<p>`, 'i');
  const blockMatch = html.match(blockRegex);
  if (!blockMatch) return [];
  const block = blockMatch[0];
  const tags = [];
  const tagRegex = /<span[^>]*class="badge[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let tagMatch = tagRegex.exec(block);
  while (tagMatch) {
    const text = stripTags(tagMatch[1]);
    if (text) tags.push(text);
    tagMatch = tagRegex.exec(block);
  }
  return tags;
}

function parseRecipePage(html, url) {
  const title =
    (html.match(/<meta property="og:title" content="([^"]+)"/i) || [])[1] ||
    (html.match(/<title>([^<|]+)\s*\|/i) || [])[1] ||
    '';
  const author = (html.match(/Recipe courtesy of<\/div>\s*([^<\n]+)/i) || [])[1] || '';
  const imageMatch =
    html.match(/<div class="row g-3 mb-5">\s*<img[^>]*src="([^"]+)"/i) ||
    html.match(/<img[^>]*class="[^"]*image-style-[^"]*"[^>]*src="([^"]+)"/i);

  return {
    url,
    slug: new URL(url).pathname.replace(/^\/recipes\//, ''),
    title: stripTags(title),
    prepTime: parseMetric(html, 'Preparation time'),
    cookTime: parseMetric(html, 'Cooking time'),
    serves: parseMetric(html, 'Serves'),
    dietitian: stripTags(author),
    photoUrl: imageMatch ? absoluteUrl(imageMatch[1]) : '',
    ingredients: parseIngredients(html),
    method: parseMethod(html),
    nutrition: parseNutrition(html),
  };
}

function toCsvValue(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${String(text).replace(/"/g, '""')}"`;
}

async function collectRecipeUrlsByFilter(indexHtml, filterName, filterLabel) {
  const options = getSelectOptions(indexHtml, filterName);
  const urlToFilterTags = new Map();
  const perOptionPages = {};
  const perOptionRecipeCounts = {};

  for (const option of options) {
    const base = new URL(INDEX_PATH, BASE_URL);
    base.searchParams.set(filterName, option.value);

    let pagesVisited = 0;
    const optionLinks = new Set();

    for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
      const pageUrl = new URL(base);
      pageUrl.searchParams.set('page', String(page));
      const pageHtml = await fetchHtml(pageUrl.toString());
      const links = extractRecipeCardLinks(pageHtml);
      if (page > 0 && links.length === 0) break;

      for (const recipeUrl of links) {
        const key = recipeUrl;
        optionLinks.add(key);
        const existing = urlToFilterTags.get(key) || { collections: new Set(), cuisines: new Set(), ingredients: new Set() };
        existing[filterLabel].add(option.label);
        urlToFilterTags.set(key, existing);
      }
      pagesVisited += 1;
      await sleep(120);
    }
    perOptionPages[option.label] = pagesVisited;
    perOptionRecipeCounts[option.label] = optionLinks.size;
    console.log(`Collected ${filterName}=${option.label} (pages: ${pagesVisited}, unique recipes: ${optionLinks.size})`);
  }

  return { options, urlToFilterTags, perOptionPages, perOptionRecipeCounts };
}

async function collectAllUnfilteredRecipeUrls() {
  const urls = new Set();
  let pagesVisited = 0;
  const pageRecipeCounts = [];
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const pageUrl = new URL(INDEX_PATH, BASE_URL);
    pageUrl.searchParams.set('page', String(page));
    const html = await fetchHtml(pageUrl.toString());

    const links = extractRecipeCardLinks(html);
    if (page > 0 && links.length === 0) break;
    pageRecipeCounts.push(links.length);
    for (const link of links) urls.add(link);
    pagesVisited += 1;
    await sleep(120);
  }

  return { urls: Array.from(urls), pagesVisited, pageRecipeCounts };
}

async function main() {
  console.log('Fetching recipe index...');
  const indexHtml = await fetchHtml(new URL(INDEX_PATH, BASE_URL).toString());

  const seedLinks = extractRecipeCardLinks(indexHtml);
  const filterDefinitions = [
    { name: 'filter_collections', label: 'collections' },
    { name: 'filter_cuisines', label: 'cuisines' },
    { name: 'filter_ingredients', label: 'ingredients' },
  ];

  const merged = new Map();
  for (const url of seedLinks) {
    merged.set(url, { collections: new Set(), cuisines: new Set(), ingredients: new Set() });
  }
  const {
    urls: unfilteredUrls,
    pagesVisited: unfilteredPagesVisited,
    pageRecipeCounts: unfilteredPageRecipeCounts,
  } = await collectAllUnfilteredRecipeUrls();
  for (const url of unfilteredUrls) {
    if (!merged.has(url)) {
      merged.set(url, { collections: new Set(), cuisines: new Set(), ingredients: new Set() });
    }
  }

  const crawlSummary = {};
  for (const filterDef of filterDefinitions) {
    const { options, urlToFilterTags, perOptionPages, perOptionRecipeCounts } = await collectRecipeUrlsByFilter(
      indexHtml,
      filterDef.name,
      filterDef.label,
    );
    crawlSummary[filterDef.name] = {
      optionCount: options.length,
      options: options.map((o) => o.label),
      pagesVisited: perOptionPages,
      uniqueRecipesByOption: perOptionRecipeCounts,
    };
    for (const [recipeUrl, tagsByType] of urlToFilterTags.entries()) {
      const existing = merged.get(recipeUrl) || { collections: new Set(), cuisines: new Set(), ingredients: new Set() };
      for (const tag of tagsByType.collections) existing.collections.add(tag);
      for (const tag of tagsByType.cuisines) existing.cuisines.add(tag);
      for (const tag of tagsByType.ingredients) existing.ingredients.add(tag);
      merged.set(recipeUrl, existing);
    }
  }

  const recipeUrls = Array.from(merged.keys()).sort();
  console.log(`Total unique recipe URLs discovered: ${recipeUrls.length}`);

  const recipes = [];
  for (let i = 0; i < recipeUrls.length; i += 1) {
    const url = recipeUrls[i];
    const html = await fetchHtml(url);
    const recipe = parseRecipePage(html, url);
    const tags = merged.get(url);
    recipe.collections = Array.from(tags?.collections || []).sort();
    recipe.cuisines = Array.from(tags?.cuisines || []).sort();
    recipe.ingredientsTags = Array.from(tags?.ingredients || []).sort();
    recipe.cardTags = parseRecipeTagsFromListing(indexHtml, new URL(url).pathname);
    recipes.push(recipe);
    console.log(`[${i + 1}/${recipeUrls.length}] ${recipe.title || recipe.slug}`);
    await sleep(120);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  await fs.writeFile(
    OUT_JSON,
    JSON.stringify(
      {
        source: BASE_URL,
        indexedAt: new Date().toISOString(),
        recipeCount: recipes.length,
        recipes,
      },
      null,
      2,
    ),
    'utf8',
  );

  const headers = [
    'title',
    'slug',
    'url',
    'prepTime',
    'cookTime',
    'serves',
    'dietitian',
    'photoUrl',
    'collections',
    'cuisines',
    'ingredientsTags',
    'ingredients',
    'method',
    'nutrition',
  ];
  const csvLines = [headers.join(',')];
  for (const recipe of recipes) {
    const row = [
      recipe.title,
      recipe.slug,
      recipe.url,
      recipe.prepTime,
      recipe.cookTime,
      recipe.serves,
      recipe.dietitian,
      recipe.photoUrl,
      recipe.collections.join(' | '),
      recipe.cuisines.join(' | '),
      recipe.ingredientsTags.join(' | '),
      recipe.ingredients.join(' || '),
      recipe.method.join(' || '),
      JSON.stringify(recipe.nutrition),
    ];
    csvLines.push(row.map(toCsvValue).join(','));
  }
  await fs.writeFile(OUT_CSV, `${csvLines.join('\n')}\n`, 'utf8');

  await fs.writeFile(
    OUT_META,
    JSON.stringify(
      {
        indexedAt: new Date().toISOString(),
        totalRecipes: recipes.length,
        filterSummary: crawlSummary,
        unfilteredIndex: {
          pagesVisited: unfilteredPagesVisited,
          recipeUrlsDiscovered: unfilteredUrls.length,
          pageRecipeCounts: unfilteredPageRecipeCounts,
        },
        output: {
          json: OUT_JSON,
          csv: OUT_CSV,
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`Wrote:\n- ${OUT_JSON}\n- ${OUT_CSV}\n- ${OUT_META}`);
}

main().catch((error) => {
  console.error('Scrape failed:', error);
  process.exit(1);
});
