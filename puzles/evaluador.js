// La máquina de puzles (T-46) · el evaluador: ¿es un paseo o tiene trampa?
//
// El resolutor dice si se puede y en cuántos turnos como mínimo; no si es DIFÍCIL.
// Un puzle de 9 turnos con miles de caminos puede ser un paseo, y uno de 5 con un
// solo camino escondido, muy duro. El evaluador mide cómo le va a alguien que NO
// conoce la solución:
//
//   azar       elige cualquier jugada válida al azar
//   prudente   igual, pero nunca hace una jugada que pierda en ese mismo turno (que
//              no quepa el paso, cosechar una roja, saltarse el orden). Es el que
//              más se parece a una persona que no planifica.
//
// Para cada uno, la TASA DE ACIERTO en N partidas con el límite de difícil (el
// mínimo), normal (+1) y fácil (+2). Y, exacto con el resolutor:
//
//   primeras   de las primeras jugadas posibles, cuántas siguen permitiendo
//              resolverlo en el mínimo. Es lo que mejor predice la dificultad
//              (correlación 0,70 en los prototipos; el número de soluciones, 0,42).
//
// La NOTA sale de la tasa del prudente en el mínimo. Los cortes son PROVISIONALES:
// el prudente no piensa y una persona sí; se calibran con las valoraciones de Iñigo
// (LC-Instrucciones §9.8).
const { azar } = require('./motor.js');
const { juegoDeNivel } = require('./colmena.js');
const { buscar } = require('./buscador.js');

const CORTES = [[0.25, 'paseo'], [0.08, 'fácil'], [0.02, 'medio'], [0.004, 'difícil']];
const NOTAS = ['paseo', 'fácil', 'medio', 'difícil', 'muy difícil'];
function nota(tasaPrudente) {
  for (const [corte, n] of CORTES) if (tasaPrudente >= corte) return n;
  return 'muy difícil';
}

function partida(juego, limite, prudente, a) {
  let e = juego.inicial;
  for (let t = 0; t < limite; t++) {
    if (juego.objetivo(e)) return true;
    const js = juego.jugadas(e);
    if (!js.length) return false;
    if (prudente) {
      const vivas = [];
      for (const j of js) { const e2 = juego.aplicar(e, j); if (e2) vivas.push(e2); }
      if (!vivas.length) return false;
      e = a.elegir(vivas);
    } else {
      e = juego.aplicar(e, a.elegir(js));
      if (!e) return false;
    }
  }
  return juego.objetivo(e);
}

function tasa(juego, limite, prudente, n, a) {
  let ok = 0;
  for (let k = 0; k < n; k++) if (partida(juego, limite, prudente, a)) ok++;
  return ok / n;
}

// De las primeras jugadas, cuántas dejan el puzle resoluble en el mínimo.
function primeras(juego, minimo, presupuesto) {
  const js = juego.jugadas(juego.inicial);
  let buenas = 0, sinSaber = 0;
  for (const j of js) {
    const e2 = juego.aplicar(juego.inicial, j);
    if (!e2) continue;
    if (juego.objetivo(e2)) { buenas++; continue; }
    const r = buscar({ ...juego, inicial: e2 }, { maxProf: minimo - 1, ...presupuesto });
    if (r.resuelto) buenas++; else if (r.agotado) sinSaber++;
  }
  return { total: js.length, buenas, sinSaber };
}

const r4 = x => Math.round(x * 1e4) / 1e4;

function evaluar(candidato, { n = 300, semilla = 1, presupuesto = { maxEstados: 1e5, maxMs: 1500 } } = {}) {
  const a = azar(semilla);
  const juego = juegoDeNivel(candidato.nivel);
  const m = candidato.minimo;
  const out = { azar: {}, prudente: {} };
  for (const [nombre, lim] of [['dificil', m], ['normal', m + 1], ['facil', m + 2]]) {
    out.azar[nombre] = r4(tasa(juego, lim, false, n, a));
    out.prudente[nombre] = r4(tasa(juego, lim, true, n, a));
  }
  out.primeras = primeras(juego, m, presupuesto);
  out.nota = nota(out.prudente.dificil);
  return out;
}

module.exports = { evaluar, nota, NOTAS };
