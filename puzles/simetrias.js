// La máquina de puzles (T-46) · giros y espejos de cada tablero.
//
// Un puzle girado o en espejo es el MISMO puzle. Las permutaciones no se escriben a
// mano: se calculan a partir de las coordenadas de cada celda. Se prueban los doce
// movimientos de un hexágono (seis giros de 60° y seis espejos) alrededor del
// centro del tablero, y se quedan los que llevan cada celda exactamente a otra: en
// el panal de 24 salen 4 (el panal no es un hexágono regular), en el de 37, 12.
// pruebas.js comprueba que cada una lleva vecinas a vecinas.
const { M } = require('./motor.js');

// Centro de cada celda: las filas se centran, como en render.js. Las celdas de una
// fila están a distancia 1 y las filas, a √3/2.
function coordenadas(tablero) {
  const filas = M.TABLEROS[tablero].filas, ancha = Math.max(...filas);
  const out = [];
  filas.forEach((n, r) => { for (let c = 0; c < n; c++) out.push([(ancha - n) / 2 + c, r * Math.sqrt(3) / 2]); });
  const cx = out.reduce((a, p) => a + p[0], 0) / out.length, cy = out.reduce((a, p) => a + p[1], 0) / out.length;
  return out.map(([x, y]) => [x - cx, y - cy]);
}

function calcular(tablero) {
  const P = coordenadas(tablero);
  const buscar = (x, y) => P.findIndex(([a, b]) => Math.abs(a - x) < 1e-6 && Math.abs(b - y) < 1e-6);
  const perms = [];
  for (const espejo of [false, true]) for (let k = 0; k < 6; k++) {
    const t = k * Math.PI / 3, c = Math.cos(t), s = Math.sin(t);
    const p = P.map(([x0, y]) => { const x = espejo ? -x0 : x0; return buscar(c * x - s * y, s * x + c * y); });
    if (p.every(i => i >= 0) && new Set(p).size === p.length) perms.push(p);
  }
  return perms;
}

const cache = {};
// Las permutaciones de un tablero: p[i] es dónde va la celda i. La primera es la identidad.
const simetrias = tablero => cache[tablero] || (cache[tablero] = calcular(tablero));

// Un nivel visto a través de una permutación.
function transformar(nivel, p) {
  const n = nivel.height.length;
  const height = new Array(n);
  for (let i = 0; i < n; i++) height[p[i]] = nivel.height[i];
  const m = cs => cs.map(i => p[i]);
  const orden = cs => m(cs).sort((a, b) => a - b);
  const o = nivel.objetivo, ob = { ...o };
  if (o.celdas) ob.celdas = o.tipo === 'orden' ? m(o.celdas) : orden(o.celdas);   // en orden, A y B no se reordenan
  if (o.rojas) ob.rojas = orden(o.rojas);
  return { tablero: nivel.tablero, rotas: orden(nivel.rotas), height, paso: nivel.paso, objetivo: ob };
}

// Las claves del objetivo, siempre en el mismo orden, para que la huella no dependa
// de cómo se escribió el objeto.
const ordenarObjetivo = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));

// La huella canónica: la menor de las versiones giradas y en espejo.
function huellaCanonica(nivel) {
  let min = null;
  for (const p of simetrias(nivel.tablero)) {
    const t = transformar(nivel, p);
    const h = JSON.stringify([t.tablero, t.rotas, t.height, t.paso, ordenarObjetivo(t.objetivo)]);
    if (min === null || h < min) min = h;
  }
  return min;
}

module.exports = { simetrias, transformar, huellaCanonica, coordenadas };
