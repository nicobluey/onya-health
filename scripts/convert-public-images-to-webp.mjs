import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'frontend/public');
const textRoots = [
  path.join(projectRoot, 'frontend/src'),
  path.join(projectRoot, 'frontend/public'),
];

const rasterExtensions = new Set(['.png', '.jpg', '.jpeg']);
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.txt',
  '.xml',
]);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return [fullPath];
    })
  );
  return files.flat();
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function hasTextExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return textExtensions.has(ext);
}

function maybeEncoded(route) {
  return encodeURI(route);
}

async function main() {
  const publicFiles = await walk(publicDir);
  const rasterFiles = publicFiles
    .filter((filePath) => rasterExtensions.has(path.extname(filePath).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  if (rasterFiles.length === 0) {
    console.log('No PNG/JPG/JPEG files found in frontend/public.');
    return;
  }

  const replacements = [];

  for (const inputPath of rasterFiles) {
    const extension = path.extname(inputPath);
    const outputPath = inputPath.slice(0, -extension.length) + '.webp';

    const inputMeta = await sharp(inputPath).metadata();

    await sharp(inputPath)
      .webp({ quality: 82, effort: 6, smartSubsample: true })
      .toFile(outputPath);

    const outputMeta = await sharp(outputPath).metadata();

    if (inputMeta.width !== outputMeta.width || inputMeta.height !== outputMeta.height) {
      throw new Error(
        `Dimension mismatch for ${inputPath}: ${inputMeta.width}x${inputMeta.height} -> ${outputMeta.width}x${outputMeta.height}`
      );
    }

    const relInput = toPosixPath(path.relative(publicDir, inputPath));
    const relOutput = relInput.replace(/\.(png|jpg|jpeg)$/i, '.webp');

    const fromRaw = `/${relInput}`;
    const toRaw = `/${relOutput}`;

    replacements.push({
      fromRaw,
      toRaw,
      fromEncoded: maybeEncoded(fromRaw),
      toEncoded: maybeEncoded(toRaw),
    });
  }

  replacements.sort((a, b) => b.fromRaw.length - a.fromRaw.length);

  const textFiles = (
    await Promise.all(textRoots.map((root) => walk(root).catch(() => [])))
  )
    .flat()
    .filter(hasTextExtension)
    .sort((a, b) => a.localeCompare(b));

  let updatedFiles = 0;

  for (const textPath of textFiles) {
    const original = await fs.readFile(textPath, 'utf8');
    let next = original;

    for (const replacement of replacements) {
      if (next.includes(replacement.fromRaw)) {
        next = next.split(replacement.fromRaw).join(replacement.toRaw);
      }
      if (next.includes(replacement.fromEncoded)) {
        next = next.split(replacement.fromEncoded).join(replacement.toEncoded);
      }
    }

    if (next !== original) {
      await fs.writeFile(textPath, next, 'utf8');
      updatedFiles += 1;
    }
  }

  for (const inputPath of rasterFiles) {
    await fs.unlink(inputPath);
  }

  console.log(`Converted ${rasterFiles.length} files to WebP.`);
  console.log(`Updated ${updatedFiles} text files with new .webp references.`);
  console.log(`Removed ${rasterFiles.length} original raster files.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
