const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public', 'models');
const outFile = path.join(__dirname, 'model-root-names.txt');

const names = fs.readdirSync(root);
fs.writeFileSync(outFile, names.join('\n'), 'utf8');
console.log('count', names.length);
console.log(outFile);
