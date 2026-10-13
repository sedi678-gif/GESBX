const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public', 'models');
const imageFolders = [
  '2X kartı',
  'casus kartı',
  'duman kartı',
  'Güzgü kartı',
  'Joker kartı',
  'oğru kartı',
  'qaya (daş kartı)',
  'qul eden kartı (zəncirlənmə)',
  'qütblərin seçimi kartı (od və buz)',
  'sehrbaz kartı',
  'tikanlı məftil kartı',
  'Təbii fəlakətlər kartı',
  'üsyan kartı',
];

const out = [];
for (const folder of imageFolders) {
  const full = path.join(root, folder);
  let files = [];
  try {
    files = fs.readdirSync(full);
  } catch (err) {
    files = [`ERR ${err.message}`];
  }
  out.push({ folder, files });
  process.stdout.write(`\n=== ${folder} ===\n${files.join('\n')}\n`);
}

fs.writeFileSync(
  path.join(__dirname, 'model-image-files.json'),
  JSON.stringify(out, null, 2),
  'utf8'
);
