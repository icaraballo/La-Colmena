// La máquina de puzles (T-46) · el generador: todo encadenado.
//
//   diales al azar → panal → partida guía → objetivo → (rojas) → resolutor → filtro → evaluador → candidato
//
// `intento(semilla, opciones)` es una función pura de su semilla y sus opciones: con
// las mismas, sale el mismo candidato (o el mismo descarte). Por eso cada candidato
// guarda su semilla, y `generar --semilla N --uno` lo reproduce.
const { M, estadoPuzle, azar } = require('./motor.js');
const { juegoDeNivel, OBJ } = require('./colmena.js');
const { buscar } = require('./buscador.js');
const { elegirForma } = require('./formas.js');
const { partidaGuia } = require('./guia.js');
const { huellaCanonica } = require('./simetrias.js');
const { evaluar } = require('./evaluador.js');

// ---------------------------------------------------------------------------
// Los diales (LC-Instrucciones-Puzle §5.7)
// ---------------------------------------------------------------------------
// Repartos de niveles: cada uno es una bolsa de la que se saca el de cada celda.
const REPARTOS = {
  llano:      [0, 0, 0, 1, 1, 1, 1, 2],
  mezcla:     [0, 1, 2, 3, 4],
  alto:       [1, 2, 3, 3, 4, 4, 5],
  escalonado: [1, 2, 2, 3, 3, 4, 4, 5],
};
// Con un panal llano no se llega a cosechar: sólo para los objetivos que no cosechan.
const repartosDe = tipo => ['escalera', 'panal'].includes(tipo) ? Object.keys(REPARTOS) : ['mezcla', 'alto', 'escalonado'];
const PASOS = [1, 1, 1, 2, 2, 3];

// Qué partida guía necesita cada tipo.
const GUIA_DE = {
  marcadas: {}, combinado: {}, total: {}, grande: {}, rojas: {},
  cosechas: { cosechasMin: 2 }, orden: { cosechasMin: 2 },
  escalera: { terminaCosechando: false }, panal: { terminaCosechando: false },
};

const OPCIONES = {
  tipos: OBJ.NOMBRES,
  forma: null,                 // null = al azar (elegirForma)
  turnos: [4, 10],             // el rango del mínimo; la guía juega L turnos dentro de él
  resolutor: { maxEstados: 3e5, maxMs: 4000 },
  guia: 4000,                  // presupuesto de jugadas de la partida guía
  evaluar: true,               // poner nota (0,4-2 s por puzle)
  partidasEval: 300,
};

// ---------------------------------------------------------------------------
// El objetivo sale de lo jugado
// ---------------------------------------------------------------------------
// Regla general: el objetivo se apoya en la ÚLTIMA jugada de la guía, para que todos
// los turnos cuenten. Si aun así hay un atajo, el resolutor lo encuentra.
const cosechasDe = g => g.historia.filter(h => h.cosecha);
const totalCosechado = g => cosechasDe(g).reduce((s, h) => s + h.cells.length, 0);

// Una celda de la última cosecha, mejor de las que empezaron más bajas.
function unaDeLaUltima(g, height, a) {
  const u = g.historia[g.historia.length - 1].cells.slice().sort((x, y) => height[x] - height[y] || a.int(3) - 1);
  return u[a.int(Math.min(2, u.length))];
}
// Turno (0..) en que se cosecha por primera vez cada celda.
function primeraCosecha(g) {
  const t = {};
  g.historia.forEach((h, k) => { if (h.cosecha) for (const c of h.cells) if (!(c in t)) t[c] = k; });
  return t;
}
const asc = arr => arr.sort((x, y) => x - y);

function objetivoDe(tipo, g, height, paso, a) {
  const L = g.historia.length, ult = g.historia[L - 1];
  switch (tipo) {
    case 'marcadas': case 'rojas': {
      const celdas = [unaDeLaUltima(g, height, a)];
      // Una de cada tres veces, una segunda marcada de una cosecha anterior.
      const otras = cosechasDe(g).slice(0, -1).flatMap(h => h.cells).filter(c => !ult.cells.includes(c));
      if (tipo === 'marcadas' && otras.length && a.int(3) === 0) celdas.push(a.elegir(otras));
      return { tipo, celdas: asc(celdas) };            // las rojas se ponen después
    }
    case 'cosechas':  return { tipo, n: cosechasDe(g).length };
    case 'total':     return { tipo, n: totalCosechado(g) };
    case 'combinado': return { tipo, n: totalCosechado(g), celdas: [unaDeLaUltima(g, height, a)] };
    case 'grande':    return { tipo, n: Math.max(...cosechasDe(g).map(h => h.cells.length)) };
    case 'escalera':  return { tipo, n: paso + L - 1 };
    case 'panal': {
      // 2 o 3 de las celdas que la última jugada dejó al mismo nivel.
      if (ult.cells.length < 2) return null;
      const nivel = g.final[ult.cells[0]];
      const celdas = asc(ult.cells.slice().sort(() => a.int(3) - 1).slice(0, 2 + a.int(2)));
      return { tipo, celdas, nivel };
    }
    case 'orden': {
      // A: cosechada por primera vez antes del último turno. B: cosechada por
      // primera vez en el último (así nunca antes que A), distinta de A.
      const pc = primeraCosecha(g);
      const as = Object.keys(pc).map(Number).filter(c => pc[c] < L - 1);
      if (!as.length) return null;
      const A = a.elegir(as);
      const bs = ult.cells.filter(c => pc[c] === L - 1 && c !== A);
      if (!bs.length) return null;
      return { tipo, celdas: [A, a.elegir(bs)] };
    }
  }
  throw new Error(`objetivo desconocido: ${tipo}`);
}

// ---------------------------------------------------------------------------
// Un intento
// ---------------------------------------------------------------------------
// Devuelve { candidato } o { descarte: motivo }. Lanza una excepción si la máquina
// se contradice (la guía resolvió el puzle y el resolutor dice que no tiene
// solución): eso es un error de la máquina, no un descarte.
function intento(semilla, opciones = {}) {
  const op = { ...OPCIONES, ...opciones };
  const a = azar(semilla);
  const [tmin, tmax] = op.turnos;
  const resolver = nivel => buscar(juegoDeNivel(nivel), { maxProf: tmax, ...op.resolutor });

  const tipo = a.elegir(op.tipos);
  const forma = elegirForma(a, op.forma);
  const reparto = a.elegir(repartosDe(tipo));
  const paso = a.elegir(PASOS);
  const L = tmin + a.int(tmax - tmin + 1);
  const n = M.TABLEROS[forma.tablero].n;
  const height = Array.from({ length: n }, () => a.elegir(REPARTOS[reparto]));
  for (const i of forma.rotas) height[i] = M.AGUA;
  const base = { tablero: forma.tablero, rotas: forma.rotas, height, paso };

  const g = partidaGuia(base, { L, ...GUIA_DE[tipo] }, a, op.guia);
  if (!g.historia) return { descarte: 'la partida guía no llega' };
  const objetivo = objetivoDe(tipo, g, height, paso, a);
  if (!objetivo) return { descarte: `la partida guía no sirve para ${tipo}` };

  // Rojas (§5.55): se resuelve SIN rojas y se prohíbe una celda que esa solución
  // corta cosecha y la guía no. Se repite, hasta 3 rojas, mientras el mínimo no
  // suba; si con 3 no ha subido, la regla sería decorado y se descarta. Las rojas
  // nunca tocan lo que cosecha la guía, así que sigue habiendo solución.
  let sinRojas = null;
  if (tipo === 'rojas') {
    const guiaCosecha = new Set(cosechasDe(g).flatMap(h => h.cells));
    objetivo.rojas = [];
    let r = resolver({ ...base, objetivo: { tipo: 'marcadas', celdas: objetivo.celdas } });
    if (r.agotado) return { descarte: `el resolutor no termina (${r.motivo})` };
    if (!r.resuelto) throw new Error(`la guía cosechó la marcada y el resolutor no: ${JSON.stringify(base)}`);
    sinRojas = r.minimo;
    let sube = false;
    for (let k = 0; k < 3 && !sube; k++) {
      // Las celdas que cosecha la solución corta: se rejuega para saber cuáles eran abeja.
      const s = estadoPuzle(base), cosechadas = new Set();
      for (const cells of r.solucion) {
        if (s.height[cells[0]] === M.MAX_LEVEL) cells.forEach(c => cosechadas.add(c));
        M.commitTurn(s, cells);
      }
      const cand = [...cosechadas].filter(c => !guiaCosecha.has(c) && !objetivo.celdas.includes(c) && !objetivo.rojas.includes(c));
      if (!cand.length) break;
      objetivo.rojas = asc([...objetivo.rojas, a.elegir(cand)]);
      r = resolver({ ...base, objetivo });
      if (r.agotado) return { descarte: `el resolutor no termina (${r.motivo})` };
      if (!r.resuelto) throw new Error(`la guía evita las rojas y el resolutor no lo resuelve: ${JSON.stringify(base)}`);
      sube = r.minimo > sinRojas;
    }
    if (!sube) return { descarte: 'rojas: prohibir no alarga el puzle' };
  }

  const nivel = { ...base, objetivo };
  const r = resolver(nivel);
  if (r.agotado) return { descarte: `el resolutor no termina (${r.motivo})` };
  if (!r.resuelto) throw new Error(`la partida guía lo resolvió y el resolutor no: ${JSON.stringify(nivel)}`);
  if (r.minimo < tmin) return { descarte: 'demasiado corto' };

  const candidato = {
    semilla, tipo, frase: OBJ.TIPOS[tipo].frase(objetivo), forma: forma.nombre, reparto, guia: L,
    nivel, minimo: r.minimo, limite: r.minimo + 2, caminos: r.caminos, sinRojas, solucion: r.solucion,
    resolutorMs: r.ms, estados: r.stats.estados, huella: huellaCanonica(nivel),
  };
  if (op.evaluar) candidato.eval = evaluar(candidato, { n: op.partidasEval, semilla });
  return { candidato };
}

module.exports = { intento, objetivoDe, OPCIONES, REPARTOS, PASOS };
