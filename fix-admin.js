const fs = require('fs');
const p = 'C:\\Users\\Lenovo\\Downloads\\gbesx\\GESBX\\services\\firebaseAdmin.js';
const lines = fs.readFileSync(p, 'utf8').split('\n');
const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Remove the control character removal comment and its following replace line
  if (line.includes('Unescaped control characters')) {
    i++; // skip the replace line on next iteration
    continue;
  }
  // Replace the broken repair block
  if (line.includes('private_key daxilindəki')) {
    out.push('    // JSON icerisinde asagi satir sonlari duzgun escape edilmise, onlari duzeltirik.');
    out.push('    try {');
    out.push("      const repaired = cleaned.replace(/\\\\n/g, '\\\\\\\\n');");
    out.push('      return JSON.parse(repaired);');
    out.push('    } catch (e2) {');
    out.push('      // Iki defa escape edilmek \\\\n simvollarini duzeltirik.');
    out.push('      try {');
    out.push("        const repaired2 = cleaned.replace(/\\\\\\\\\\\\\\\\n/g, '\\\\\\\\n');");
    out.push('        return JSON.parse(repaired2);');
    out.push('      } catch (e3) {');
    out.push('        throw e1;');
    out.push('      }');
    out.push('    }');
    // Skip the old repair block lines (comment through catch)
    let skipped = 0;
    while (i + 1 < lines.length && skipped < 11) {
      i++;
      skipped++;
    }
    continue;
  }
  out.push(line);
}
fs.writeFileSync(p, out.join('\n'), 'utf8');
console.log('Done. Total lines:', out.length);
