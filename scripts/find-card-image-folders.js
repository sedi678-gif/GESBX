const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public', 'models');
const infoFolders = [
  '2X karti',
  'casus karti',
  'duman karti',
  'Güzgə karti',
  'Joker karti',
  'ogru karti',
  'qaya (das karti)',
  'qul eden karti (zəncirlənmə)',
  'qütblərin seçimi karti (od və buz)',
  'sehrbaz karti',
  'tikanli məftil karti',
  'Təbii fəlakətlər karti',
  'üsyan karti',
];

function variants(folder) {
  const base = folder.replace(/\s*karti\s*$/i, '').trim();
  const noParen = base.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    `${folder} sekilleri`,
    `${folder} şəkilləri`,
    `${folder} sekiller`,
    `${folder} şəkillər`,
    `${folder} sekil`,
    `${folder} şəkil`,
    `${folder} images`,
    `${folder} img`,
    `${base}`,
    `${base} sekilleri`,
    `${base} şəkilləri`,
    `${base} sekiller`,
    `${noParen}`,
    `${noParen} sekilleri`,
    `${noParen} şəkilləri`,
    folder.replace(/karti/i, 'sekilleri'),
    folder.replace(/karti/i, 'şəkilləri'),
  ];
}

const seen = new Set();
for (const folder of infoFolders) {
  process.stdout.write(`\n# ${folder}\n`);
  for (const guess of variants(folder)) {
    if (seen.has(guess)) continue;
    seen.add(guess);
    const full = path.join(root, guess);
    if (!fs.existsSync(full)) continue;
    let files = [];
    try {
      files = fs.readdirSync(full);
    } catch (err) {
      process.stdout.write(`YESDIR ${guess} ERR ${err.message}\n`);
      continue;
    }
    process.stdout.write(`YES ${guess}\n${files.join('\n')}\n`);
  }
}
