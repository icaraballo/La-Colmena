// La máquina de puzles (T-46) · las formas del panal (LC-Instrucciones §5.57).
//
// Una forma es un tablero del motor (panal24 o hex37) con algunas celdas rotas. No
// hay que dibujar nada nuevo: la celda rota ya se pinta como hueco en el juego.
//
//   - FIJAS: el catálogo, con nombre. Son las que elige Iñigo.
//   - CON HUECOS AL AZAR: una base a la que se le quitan unas cuantas celdas,
//     siempre que lo que queda siga siendo UNA pieza.
const { M } = require('./motor.js');

const adj = t => M.TABLEROS[t].adj;
const todas = t => [...Array(M.TABLEROS[t].n).keys()];
const disco = (t, c) => [c, ...adj(t)[c]];             // una celda y sus 6 vecinas

// El anillo de fuera del hex37 (lo que abre Expansión): quitarlo deja el hexágono de 19.
const ANILLO_37 = M.CERRADAS_EXPANSION.slice();

// Dos zonas unidas por un cuello, en el hex37: dos discos de 7 celdas en la fila
// del medio (centros 16 y 20) y la celda 18 entre ellos. Para pasar de un lado al
// otro, la cadena tiene que cruzar por esa única celda.
const CUELLO = [...disco('hex37', 16), 18, ...disco('hex37', 20)];

const FIJAS = {
  'anillo fino 14': { tablero: 'panal24', rotas: [5, 6, 7, 10, 11, 12, 13, 16, 17, 18] },
  'cuello 15':      { tablero: 'hex37',   rotas: todas('hex37').filter(i => !CUELLO.includes(i)) },
  'hexágono 19':    { tablero: 'hex37',   rotas: ANILLO_37 },
  'anillo 20':      { tablero: 'panal24', rotas: [6, 11, 12, 17] },
};

// Las bases de los huecos al azar, y cuántas celdas se les quitan.
const BASES = {
  'panal 24':    { tablero: 'panal24', rotas: [],        quitar: [4, 8] },
  'hexágono 19': { tablero: 'hex37',   rotas: ANILLO_37, quitar: [2, 4] },
};

// Las celdas vivas forman una sola pieza.
function conexa(tablero, rotas) {
  const rota = new Set(rotas);
  const vivas = todas(tablero).filter(i => !rota.has(i));
  if (!vivas.length) return false;
  const visto = new Set([vivas[0]]), pila = [vivas[0]];
  while (pila.length)
    for (const v of adj(tablero)[pila.pop()]) if (!rota.has(v) && !visto.has(v)) { visto.add(v); pila.push(v); }
  return visto.size === vivas.length;
}

// Huecos al azar: se quitan celdas de una en una y se deshace la que partiría el panal.
function conHuecos(base, a) {
  const { tablero, rotas, quitar: [desde, hasta] } = BASES[base];
  const out = rotas.slice();
  let falta = desde + a.int(hasta - desde + 1), intentos = 0;
  while (falta > 0 && intentos++ < 200) {
    const vivas = todas(tablero).filter(i => !out.includes(i));
    out.push(a.elegir(vivas));
    if (conexa(tablero, out)) falta--; else out.pop();
  }
  return { tablero, rotas: out.sort((x, y) => x - y) };
}

// Una forma: la pedida, o tres de cada cinco veces del catálogo y el resto con
// huecos. `pedida` es un nombre del catálogo, una base con « con huecos» detrás,
// o 'huecos' (cualquier base).
function elegirForma(a, pedida) {
  if (pedida && FIJAS[pedida]) return { nombre: pedida, ...FIJAS[pedida] };
  const base = pedida && pedida.endsWith(' con huecos') ? pedida.slice(0, -' con huecos'.length) : null;
  if (base && !BASES[base]) throw new Error(`forma desconocida: ${pedida}`);
  if (pedida && !base && pedida !== 'huecos') throw new Error(`forma desconocida: ${pedida}`);
  if (base || pedida === 'huecos' || a.int(5) >= 3) {
    const b = base || a.elegir(Object.keys(BASES));
    return { nombre: `${b} con huecos`, ...conHuecos(b, a) };
  }
  const nombre = a.elegir(Object.keys(FIJAS));
  return { nombre, ...FIJAS[nombre] };
}

const NOMBRES_FORMAS = [...Object.keys(FIJAS), ...Object.keys(BASES).map(b => `${b} con huecos`), 'huecos'];

module.exports = { FIJAS, BASES, conexa, conHuecos, elegirForma, NOMBRES_FORMAS };
