// La máquina de puzles (T-46) · las pruebas: `npm run test:puzles`.
//
// Como tests/smoke.js: sin librería, ok(condición, mensaje) y eq(obtenido,
// esperado, mensaje), y al final «N/N comprobaciones correctas».
const fs = require('fs'), vm = require('vm'), path = require('path');
const { M, estadoPuzle, azar, mezclar } = require('./motor.js');
const { buscar } = require('./buscador.js');
const { juegoDeNivel, jugadas, OBJ } = require('./colmena.js');
const { FIJAS, conexa, elegirForma } = require('./formas.js');
const { simetrias, transformar, huellaCanonica } = require('./simetrias.js');
const { intento } = require('./generador.js');
const { comprobar, partidaAparte } = require('./comprobador.js');
const { evaluar, nota } = require('./evaluador.js');

let total = 0, fallos = 0;
function ok(c, msg) { total++; if (!c) { fallos++; console.log('  FALLA: ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (sale ${a}, se esperaba ${b})`); }
const seccion = t => console.log(t);

// ---------------------------------------------------------------------------
seccion('El buscador');
// ---------------------------------------------------------------------------
// De 1 a 10 sumando 1 o multiplicando por 2: 1 → 2 → 4 → 5 → 10. Mínimo 4, y dos
// soluciones, porque de 1 a 2 se llega de las dos maneras.
const juguete = objetivo => ({
  inicial: 1, jugadas: () => ['+1', '×2'], aplicar: (e, j) => j === '+1' ? e + 1 : e * 2,
  objetivo, huella: e => String(e),
});
{
  const r = buscar(juguete(e => e === 10));
  ok(r.resuelto, 'el juego de juguete se resuelve');
  eq(r.minimo, 4, 'mínimo del juego de juguete');
  eq(r.caminos, 2, 'soluciones del juego de juguete');
  eq(r.solucion.reduce((e, j) => j === '+1' ? e + 1 : e * 2, 1), 10, 'la solución reconstruida llega a 10');
  const nunca = buscar(juguete(e => e === 0), { maxProf: 6 });
  ok(!nunca.resuelto && !nunca.agotado, 'sin solución: no resuelto, y no es «agotado»');
  const corto = buscar(juguete(e => e === 1000), { maxEstados: 5 });
  ok(!corto.resuelto && corto.agotado, 'sin presupuesto: «agotado» (no sabe), no «sin solución»');
  const muertas = buscar({ ...juguete(e => e === 10), aplicar: () => null });
  ok(!muertas.resuelto && !muertas.agotado, 'si todas las ramas mueren, no hay solución');
}

// ---------------------------------------------------------------------------
seccion('La enumeración de jugadas, contra la fuerza bruta');
// ---------------------------------------------------------------------------
// Todos los subconjuntos de k celdas que isValidDrag acepta, en tableros al azar de
// los dos tamaños, con rotas: tienen que salir exactamente los mismos, sin repetir.
{
  const a = azar(12345);
  function combinaciones(n, k, f, desde = 0, acc = []) {
    if (acc.length === k) return f(acc);
    for (let i = desde; i < n; i++) { acc.push(i); combinaciones(n, k, f, i + 1, acc); acc.pop(); }
  }
  let casos = 0, distintos = 0;
  for (const [tablero, kmax] of [['panal24', 5], ['hex37', 4]]) {
    const n = M.TABLEROS[tablero].n;
    for (const niveles of [1, 2, 3]) for (let rep = 0; rep < 4; rep++) for (let k = 1; k <= kmax; k++) {
      const height = Array.from({ length: n }, () => a.int(niveles));
      const rotas = [...Array(n).keys()].filter(() => a.int(6) === 0);
      const s = estadoPuzle({ tablero, height, rotas, paso: k });
      const mias = jugadas(s).map(c => c.slice().sort((x, y) => x - y).join(','));
      const unicas = new Set(mias), bruta = new Set();
      combinaciones(n, k, c => { if (M.isValidDrag(s, c)) bruta.add(c.join(',')); });
      casos++;
      if (!(unicas.size === mias.length && unicas.size === bruta.size && [...bruta].every(x => unicas.has(x)))) distintos++;
    }
  }
  eq(casos, 108, 'casos de la enumeración');
  eq(distintos, 0, 'casos en que la enumeración no coincide con la fuerza bruta');
}

// ---------------------------------------------------------------------------
seccion('Las formas y las simetrías');
// ---------------------------------------------------------------------------
{
  const vivas = f => M.TABLEROS[f.tablero].n - f.rotas.length;
  eq(vivas(FIJAS['anillo fino 14']), 14, 'anillo fino 14');
  eq(vivas(FIJAS['cuello 15']), 15, 'cuello 15');
  eq(vivas(FIJAS['hexágono 19']), 19, 'hexágono 19');
  eq(vivas(FIJAS['anillo 20']), 20, 'anillo 20');
  ok(Object.values(FIJAS).every(f => conexa(f.tablero, f.rotas)), 'las formas del catálogo son de una pieza');
  const a = azar(3);
  let partidas = 0;
  for (let k = 0; k < 200; k++) { const f = elegirForma(a, 'huecos'); if (!conexa(f.tablero, f.rotas)) partidas++; }
  eq(partidas, 0, 'formas con huecos partidas en dos');

  eq(simetrias('panal24').length, 4, 'simetrías del panal de 24');
  eq(simetrias('hex37').length, 12, 'simetrías del hexágono de 37');
  for (const t of ['panal24', 'hex37']) {
    const adj = M.TABLEROS[t].adj;
    ok(simetrias(t).every(p => adj.every((vs, i) => vs.every(j => adj[p[i]].includes(p[j])))), `${t}: cada simetría lleva vecinas a vecinas`);
    ok(simetrias(t)[0].every((v, i) => v === i), `${t}: la primera es la identidad`);
  }
  // Un nivel girado tiene la misma huella canónica, y otro distinto no.
  const nivel = { tablero: 'hex37', rotas: FIJAS['cuello 15'].rotas, paso: 2,
    height: Array.from({ length: 37 }, (_, i) => i % 6), objetivo: { tipo: 'orden', celdas: [17, 19] } };
  for (const t of nivel.rotas) nivel.height[t] = 0;
  const h = huellaCanonica(nivel);
  ok(simetrias('hex37').every(p => huellaCanonica(transformar(nivel, p)) === h), 'girado o en espejo, el nivel es el mismo');
  ok(huellaCanonica({ ...nivel, objetivo: { tipo: 'orden', celdas: [19, 17] } }) !== h, 'en orden, cambiar A por B es otro puzle');
  ok(huellaCanonica({ ...nivel, paso: 3 }) !== h, 'otro paso de arranque es otro puzle');
}

// ---------------------------------------------------------------------------
seccion('Los nueve tipos, en niveles hechos a mano');
// ---------------------------------------------------------------------------
// Un trozo de 7 celdas del panal de 24: la 5 y sus vecinas (0, 1, 4, 6, 10, 11). Para
// cada tipo, un nivel con su mínimo, que se comprueba de tres maneras: el
// resolutor, el resolutor sin poda y la fuerza bruta con el motor y el código de
// objetivos del comprobador (sin objetivos.js).
const VIVAS = [0, 1, 4, 5, 6, 10, 11];
const ROTAS7 = [...Array(24).keys()].filter(i => !VIVAS.includes(i));
const enTrozo = (niveles, paso, objetivo) => {
  const height = Array(24).fill(0);
  VIVAS.forEach((c, k) => { height[c] = niveles[k]; });
  return { tablero: 'panal24', rotas: ROTAS7, height, paso, objetivo };
};
// La fuerza bruta: rejuega cada secuencia desde cero, hasta `max` jugadas.
function minimoBruto(nivel, max) {
  let mejor = null;
  (function dfs(seq) {
    if (mejor !== null && seq.length >= mejor) return;
    const p = partidaAparte(nivel);
    for (const c of seq) if (p.jugar(c)) return;
    if (seq.length && p.cumplido()) { mejor = seq.length; return; }
    if (seq.length === max) return;
    for (const c of jugadas(p.s)) dfs([...seq, c]);
  })([]);
  return mejor;
}
const CASOS = [
  // niveles de 0 1 4 5 6 10 11, paso, objetivo, mínimo
  // Subir 4,5 · 4,10,5 · 0,5,10,4 a abeja… y cosechar los cinco con la 5 dentro.
  ['marcadas',  [4, 4, 2, 2, 0, 3, 5], 2, { tipo: 'marcadas', celdas: [5] }, 4],
  // Cosechar la 5 · subir la 0 y la 1 a abeja · cosecharlas con la 6.
  ['cosechas',  [4, 4, 0, 5, 5, 3, 4], 1, { tipo: 'cosechas', n: 2 }, 3],
  ['total',     [3, 4, 3, 2, 3, 2, 5], 1, { tipo: 'total', n: 4 }, 4],
  ['combinado', [0, 5, 3, 5, 4, 3, 4], 1, { tipo: 'combinado', n: 4, celdas: [10] }, 4],
  ['grande',    [4, 3, 0, 0, 3, 1, 4], 1, { tipo: 'grande', n: 3 }, 4],
  ['escalera',  [2, 5, 3, 2, 3, 4, 5], 2, { tipo: 'escalera', n: 4 }, 3],
  ['panal',     [0, 2, 0, 0, 2, 4, 3], 1, { tipo: 'panal', celdas: [0, 11], nivel: 3 }, 4],
  // Una sola solución: 5 · 4,5 · 4,10,5 (la 6, roja, no se puede cosechar).
  ['rojas',     [2, 0, 4, 3, 4, 5, 0], 1, { tipo: 'rojas', celdas: [5], rojas: [6] }, 3],
  ['orden',     [5, 4, 3, 4, 5, 4, 4], 1, { tipo: 'orden', celdas: [0, 11] }, 3],
];
for (const [tipo, niveles, paso, objetivo, minimo] of CASOS) {
  const nivel = enTrozo(niveles, paso, objetivo);
  const r = buscar(juegoDeNivel(nivel), { maxProf: 6 });
  const sinPoda = buscar({ ...juegoDeNivel(nivel), poda: null }, { maxProf: 6 });
  eq(r.minimo, minimo, `${tipo}: mínimo del resolutor`);
  eq(sinPoda.minimo, minimo, `${tipo}: mínimo sin poda`);
  eq(minimoBruto(nivel, minimo), minimo, `${tipo}: mínimo por fuerza bruta`);
  eq(comprobar({ nivel, solucion: r.solucion, minimo: r.minimo }), 'ok', `${tipo}: el comprobador acepta la solución`);
  ok(typeof OBJ.TIPOS[tipo].frase(objetivo) === 'string', `${tipo}: tiene frase`);
}
{
  // Las reglas que pierden, en el trozo con la 5 y la 6 en abeja y paso 2.
  const dos = objetivo => enTrozo([0, 0, 0, 5, 5, 0, 0], 2, objetivo);
  eq(partidaAparte(dos({ tipo: 'rojas', celdas: [5], rojas: [6] })).jugar([5, 6]), 'cosecha una roja', 'cosechar una roja pierde');
  eq(partidaAparte(dos({ tipo: 'orden', celdas: [5, 6] })).jugar([5, 6]), 'cosecha la B antes que la A', 'cosechar la A y la B a la vez pierde');
  eq(partidaAparte(dos({ tipo: 'orden', celdas: [6, 5] })).jugar([5, 6]), 'cosecha la B antes que la A', '…se escriban como se escriban');
  const subir = partidaAparte(dos({ tipo: 'rojas', celdas: [0], rojas: [5] }));
  eq(subir.jugar([0, 1]), null, 'subir celdas que no son rojas no pierde');
  const rojas = enTrozo(CASOS[7][1], 1, CASOS[7][3]);
  eq(comprobar({ nivel: rojas, solucion: [[5], [4, 5]], minimo: 2 }), 'no cumple el objetivo', 'el comprobador no acepta una solución a medias');
  eq(comprobar({ nivel: rojas, solucion: [[5], [4, 5], [4, 10, 5]], minimo: 2 }), 'la solución no mide el mínimo', 'ni una que no mide el mínimo');
}

// ---------------------------------------------------------------------------
seccion('El generador, el comprobador, la poda y una segunda opinión');
// ---------------------------------------------------------------------------
// Una tanda fija: misma semilla, mismo resultado; todos los candidatos pasan el
// comprobador; con poda y sin poda sale el mismo mínimo; y una búsqueda sin poda ni
// huellas, con el motor, no encuentra nada más corto que el mínimo.
{
  const sinTiempo = r => JSON.stringify(r, (k, v) => k === 'resolutorMs' ? undefined : v);
  const cands = [];
  let iguales = 0, mal = 0, intentos = 0;
  const op = { evaluar: false, turnos: [4, 7] };
  for (let k = 0; cands.length < 12 && k < 200; k++, intentos++) {
    const s = mezclar(99, k);
    const r = intento(s, op);
    if (sinTiempo(intento(s, op)) === sinTiempo(r)) iguales++;
    if (!r.candidato) continue;
    cands.push(r.candidato);
    if (comprobar(r.candidato) !== 'ok') mal++;
  }
  eq(cands.length, 12, 'la tanda fija da 12 candidatos');
  eq(iguales, intentos, 'con la misma semilla, el mismo intento');
  eq(mal, 0, 'candidatos que el comprobador rechaza');
  ok(new Set(cands.map(c => c.tipo)).size >= 5, 'la tanda tiene variedad de tipos');

  let distintos = 0, revisados = 0;
  for (const c of cands.filter(c => c.estados < 20000)) {
    const r = buscar({ ...juegoDeNivel(c.nivel), poda: null }, { maxProf: c.minimo, maxEstados: 4e5 });
    if (r.agotado) continue;
    revisados++;
    if (r.minimo !== c.minimo) distintos++;
  }
  ok(revisados >= 5, `la poda se revisa en bastantes candidatos (${revisados})`);
  eq(distintos, 0, 'candidatos cuyo mínimo cambia sin poda');

  // La segunda opinión: la fuerza bruta hasta mínimo − 1, en los más pequeños.
  const pequenos = cands.filter(c => c.minimo === 4).slice(0, 3);
  ok(pequenos.length >= 2, 'hay candidatos pequeños para la segunda opinión');
  for (const c of pequenos) eq(minimoBruto(c.nivel, c.minimo - 1), null, `${c.tipo} de mínimo 4: nada más corto por fuerza bruta`);

  // El evaluador: la nota sale de la tasa del prudente; las primeras jugadas, del resolutor.
  const e = evaluar(cands[0], { n: 60, semilla: 1 });
  ok(['paseo', 'fácil', 'medio', 'difícil', 'muy difícil'].includes(e.nota), 'el evaluador da una nota');
  eq(e.nota, nota(e.prudente.dificil), 'la nota sale de la tasa del prudente en el mínimo');
  ok(e.primeras.buenas >= 1 && e.primeras.buenas <= e.primeras.total, 'alguna primera jugada lleva a la solución');
  ok([...Object.values(e.azar), ...Object.values(e.prudente)].every(t => t >= 0 && t <= 1), 'las tasas van de 0 a 1');
  eq(JSON.stringify(evaluar(cands[0], { n: 60, semilla: 1 })), JSON.stringify(e), 'el evaluador es reproducible');
}

// ---------------------------------------------------------------------------
seccion('La segunda pasada (repescar)');
// ---------------------------------------------------------------------------
// La semilla 146 es de las que el resolutor no termina en los 4 s de `generar`
// (02-10, en una tanda de 3000): con poco tiempo, se descarta por agotado; con
// más, sale el puzle (mínimo 7). Es lo que hace `repescar`: el mismo intento con
// otro presupuesto, que como el intento es puro, da el mismo tablero.
{
  const prisa = intento(146, { evaluar: false, resolutor: { maxEstados: 3e5, maxMs: 300 } });
  ok(prisa.descarte && prisa.descarte.startsWith('el resolutor no termina'), 'con 0,3 s, la 146 se descarta por agotada');
  const calma = intento(146, { evaluar: false, resolutor: { maxEstados: 2e6, maxMs: 60000 } });
  ok(calma.candidato, 'con 60 s, sale');
  eq(calma.candidato && calma.candidato.minimo, 7, 'y su mínimo es 7');
  eq(calma.candidato && comprobar(calma.candidato), 'ok', 'y pasa el comprobador');
}

// ---------------------------------------------------------------------------
seccion('objetivos.js como script clásico, con el motor alrededor');
// ---------------------------------------------------------------------------
{
  // Como lo cargaría una página: el motor y objetivos.js en el mismo ámbito global.
  const motor = ['constants.js', 'state.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');
  const src = fs.readFileSync(path.join(__dirname, 'objetivos.js'), 'utf8');
  const ctx = {};
  vm.runInNewContext(motor + '\n' + src + `
    this.O = crearObjetivos({ MAX_LEVEL, OBJETIVO_INFO, seguimientoPuzle, avanzarPuzle, cumplidoPuzle, rompePuzle });`, ctx);
  eq(ctx.O && ctx.O.NOMBRES.length, 9, 'sin module, crearObjetivos queda declarada y da los nueve tipos');
  eq(ctx.O.TIPOS.rojas.frase({ celdas: [3], rojas: [4] }), 'Cosecha la celda marcada sin cosechar ninguna roja', 'y las frases salen de OBJETIVO_INFO');
}

// ---------------------------------------------------------------------------
console.log(`${total - fallos}/${total} comprobaciones correctas`);
if (fallos) process.exit(1);
