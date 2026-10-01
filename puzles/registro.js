// La máquina de puzles (T-46) · el registro: nada repetido.
//
// Guarda la huella canónica (simetrias.js) de todo lo que ya existe: los lotes de
// puzles/salida/ y, desde la F3, los niveles de js/puzles.js. El generador descarta
// lo que ya está. No necesita fichero propio: lo que existe ya está en esos sitios.
const fs = require('fs'), path = require('path');
const { huellaCanonica } = require('./simetrias.js');

const SALIDA = path.join(__dirname, 'salida');

// Los candidatos de un lote .jsonl.
function leerLote(fichero) {
  return fs.readFileSync(fichero, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function lotes(dir = SALIDA) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /^lote-.*\.jsonl$/.test(f)).sort().map(f => path.join(dir, f));
}

function crearRegistro({ dir = SALIDA, conLotes = true } = {}) {
  const vistas = new Set();
  if (conLotes) for (const f of lotes(dir)) for (const c of leerLote(f)) vistas.add(c.huella || huellaCanonica(c.nivel));
  // F3: aquí se añaden los niveles de js/puzles.js.
  return {
    tamano: () => vistas.size,
    tiene: huella => vistas.has(huella),
    // true si es nuevo (y queda apuntado); false si ya existía.
    apuntar(huella) { if (vistas.has(huella)) return false; vistas.add(huella); return true; },
  };
}

module.exports = { crearRegistro, leerLote, lotes, SALIDA };
