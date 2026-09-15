import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const folders = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const files = (await Promise.all(folders.map(async (folder) =>
  (await readdir(path.join(root, folder))).map((name) => `${folder}/${name}`)
))).flat();
const knownFiles = new Set(files);
const errors = [];
let jsonCount = 0;
let schemaCount = 0;
const parseJson = (source) => JSON.parse(source
  .replace(/^\s*\/\*[\s\S]*?\*\//, '')
  .replace(/^[ \t]*\/\/.*$/gm, ''));

for (const file of files) {
  if (!/\.(json|liquid)$/.test(file)) continue;
  const source = await readFile(path.join(root, file), 'utf8');
  try {
    if (file.endsWith('.json')) {
      const data = parseJson(source);
      jsonCount++;
      if (file.startsWith('templates/') || file.endsWith('-group.json')) {
        for (const section of Object.values(data.sections || {})) {
          if (!knownFiles.has(`sections/${section.type}.liquid`)) errors.push(`${file}: missing section ${section.type}`);
        }
      }
    } else {
      for (const match of source.matchAll(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/g)) {
        parseJson(match[1]);
        schemaCount++;
      }
      const liquid = source.replace(/{%-?\s*(doc|comment)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '');
      for (const match of liquid.matchAll(/\brender\s+['"]([^'"]+)['"]/g)) {
        if (!knownFiles.has(`snippets/${match[1]}.liquid`)) errors.push(`${file}: missing snippet ${match[1]}`);
      }
      for (const match of liquid.matchAll(/['"]([^'"]+)['"]\s*\|\s*(?:asset_url|inline_asset_content)\b/g)) {
        if (!knownFiles.has(`assets/${match[1]}`)) errors.push(`${file}: missing asset ${match[1]}`);
      }
    }
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

const guide = parseJson(await readFile(path.join(root, 'templates/page.gift-guide.json'), 'utf8'));
const expectedSections = ['gift-guide-banner', 'gift-guide-grid'];
const actualSections = guide.order.map((id) => guide.sections[id]?.type);
if (JSON.stringify(actualSections) !== JSON.stringify(expectedSections)) {
  errors.push('Gift guide template must contain the two custom sections in banner/grid order.');
}
for (const name of expectedSections) {
  const source = await readFile(path.join(root, `sections/${name}.liquid`), 'utf8');
  if (/{%-?\s*(render|section|sections|content_for)\b/.test(source)) {
    errors.push(`${name}: custom sections must not render ready-made theme components.`);
  }
}

if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exitCode = 1;
} else {
  console.log(`${folders.length} folders, ${files.length} theme files, ${jsonCount} JSON files, ${schemaCount} section/block schemas checked.`);
  console.log('Static asset/snippet references and the two-section gift guide template passed.');
}
