// Hook PostToolUse (Edit/Write/MultiEdit): comprova la sintaxi del que s'acaba d'editar.
// No hi ha tests ni linter (CLAUDE.md), o sigui que això és el mínim abans de donar una feina per bona.
// Sortir amb codi 2 li torna l'error a Claude perquè l'arregli; l'edició ja està feta.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let entrada = '';
process.stdin.on('data', (c) => (entrada += c));
process.stdin.on('end', () => {
  let ev;
  try { ev = JSON.parse(entrada); } catch { process.exit(0); }
  const fitxer = ev.tool_input && ev.tool_input.file_path;
  if (!fitxer || !fs.existsSync(fitxer)) process.exit(0);

  const arrel = process.env.CLAUDE_PROJECT_DIR || ev.cwd || process.cwd();
  const rel = path.relative(arrel, path.resolve(arrel, fitxer)).split(path.sep).join('/');
  const errors = [];

  if (/\.js$/.test(rel)) {
    const e = nodeCheck(fitxer);
    if (e) errors.push(e);
  } else if (/\.html?$/.test(rel)) {
    // node --check no llegeix HTML: es treu cada <script> de dins (els que tenen src no) i es comprova sol.
    const html = fs.readFileSync(fitxer, 'utf8');
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html))) {
      if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue;
      const linia = html.slice(0, m.index).split('\n').length;
      const tmp = path.join(os.tmpdir(), `claude-script-${process.pid}-${linia}.js`);
      // Es farceix amb salts de línia perquè l'error digui la línia de l'HTML.
      fs.writeFileSync(tmp, '\n'.repeat(linia - 1) + m[2]);
      const e = nodeCheck(tmp);
      fs.unlinkSync(tmp);
      if (e) errors.push(`<script> de la línia ${linia} de ${rel}:\n${e}`);
    }
  }

  if (errors.length) {
    process.stderr.write(`❌ Error de sintaxi després d'editar ${rel}:\n${errors.join('\n')}\n`);
    process.exit(2);
  }

  // Trampa 1: un canvi a la fórmula té feina associada que no es veu al codi.
  if (rel === 'formula-risc.js') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'Has tocat formula-risc.js. Recorda (CLAUDE.md, trampa 1): ' +
          'si canvia el significat dels punts, puja RISC_FORMULA_VERSIO; ' +
          'actualitza l\'explicació de Configuració → Fórmula de risc i el manual integrat de l\'index.html; ' +
          'puja el ?v= del <script src="formula-risc.js"> perquè els navegadors no es quedin la vella; ' +
          'i copia\'l a proves/formula-risc.js.',
      },
    }));
  }
  process.exit(0);
});

function nodeCheck(f) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    return null;
  } catch (e) {
    return String(e.stderr || e.message).trim();
  }
}
