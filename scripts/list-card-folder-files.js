const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public', 'models');
const folders = [
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

for (const folder of folders) {
  const dir = path.join(root, folder);
  process.stdout.write(`\n=== ${folder} ===\n`);
  try {
    const names = fs.readdirSync(dir);
    process.stdout.write(names.join('\n') + '\n');
  } catch (err) {
    process.stdout.write(`ERR ${err.message}\n`);
  }
}
