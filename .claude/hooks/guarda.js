// Hook PreToolUse (Edit/Write/MultiEdit): atura els canvis que Claude no ha de fer mai.
// Només afecta les sessions de Claude Code; ni la web ni els workflows no el llegeixen.
// Sortir amb codi 2 bloqueja l'edició i el text de stderr li arriba a Claude.

const path = require('path');

let entrada = '';
process.stdin.on('data', (c) => (entrada += c));
process.stdin.on('end', () => {
  let ev;
  try { ev = JSON.parse(entrada); } catch { process.exit(0); }
  const input = ev.tool_input || {};
  if (!input.file_path) process.exit(0);

  const arrel = process.env.CLAUDE_PROJECT_DIR || ev.cwd || process.cwd();
  const rel = path.relative(arrel, path.resolve(arrel, input.file_path)).split(path.sep).join('/');

  // CLAUDE.md, Convencions: data/*.json els commiteja el workflow per commit-dades.sh.
  if (/^(proves\/)?data\/.*\.json$/.test(rel)) {
    bloquejar(`${rel} l'escriuen els workflows (scripts/commit-dades.sh), no s'edita a mà. ` +
      'Si cal regenerar-lo, llança el workflow que toca (Actions → Dades diàries GRAE).');
  }

  // Trampa 9: la clau service_role no pot anar mai al frontend.
  const text = [input.content, input.new_string, ...(input.edits || []).map((e) => e.new_string)]
    .filter((t) => typeof t === 'string').join('\n');
  if (/\.html?$/.test(rel) && conteClauSecreta(text)) {
    bloquejar(`${rel}: el canvi hi posa una clau secreta de Supabase (service_role o sb_secret_). ` +
      'El frontend només pot portar la clau anon; la service_role va als GitHub Secrets.');
  }
  process.exit(0);
});

// Busca el valor de la clau, no la paraula: el manual integrat parla de «service_role».
function conteClauSecreta(text) {
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) return true;
  const jwts = text.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  return jwts.some((jwt) => {
    try {
      return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role === 'service_role';
    } catch { return false; }
  });
}

function bloquejar(motiu) {
  process.stderr.write(`⛔ Bloquejat pel hook .claude/hooks/guarda.js: ${motiu}\n`);
  process.exit(2);
}
