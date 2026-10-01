// La máquina de puzles (T-46) · la partida guía (LC-Instrucciones §5.46).
//
// Juega una partida con el motor real para FABRICAR un puzle que seguro que tiene
// solución: lo que haga esta partida es, por definición, posible.
//
// Busca una partida de exactamente L turnos y, cuando se mete en un callejón,
// DESHACE la última jugada y prueba otra (búsqueda en profundidad con marcha atrás).
// Sigue siendo al azar: el orden en que prueba las jugadas se baraja, así que cada
// partida guía es distinta. Medido en los prototipos: sin marcha atrás se atascaba
// en 2-4 turnos, porque la escalera trocea el panal más deprisa de lo que una
// elección a ciegas lo arregla.
//
// Tiene un presupuesto de jugadas probadas; si se acaba, se rinde y el generador
// prueba otro panal. Una jugada que deja el paso siguiente sin sitio vale como
// ÚLTIMA: con ella se cumple el objetivo y el nivel termina (§5.52).
const { M, estadoPuzle } = require('./motor.js');
const { jugadas } = require('./colmena.js');

const MUESTRA = 25;            // jugadas que se prueban como mucho en cada turno
const hastaCosecha = h => M.MAX_LEVEL - h + 1;

function copiar(s) {
  const c = Object.assign({}, s);
  c.height = s.height.slice(); c.eventos = []; c.last = null;
  return c;
}

// Orden al azar, pero con preferencia: cosechar y subir a abeja primero (si no,
// rara vez se llega a cosechar), y subir celdas altas antes que bajas.
function ordenar(s, js, a) {
  const clave = cells => {
    const h = s.height[cells[0]];
    return (h === M.MAX_LEVEL ? 3 : h === M.MAX_LEVEL - 1 ? 2 : h >= 2 ? 1 : 0) + a.R() * 2.2;
  };
  return js.map(c => [clave(c), c]).sort((x, y) => y[0] - x[0]).map(x => x[1]);
}

// pide: { L, cosechasMin = 1, terminaCosechando = true }
// Con terminaCosechando = false (escalera y panal) vale cualquier partida de L
// turnos: esos objetivos no necesitan cosechar.
// Devuelve { historia: [{ cells, nivel, cosecha }] | null, final, probadas }.
function partidaGuia(nivel, pide, a, presupuesto = 4000) {
  const s0 = estadoPuzle(nivel);
  let vivas = 0;
  for (let i = 0; i < s0.height.length; i++) if (M.existe(s0, i)) vivas++;
  const { L, cosechasMin = 1, terminaCosechando = true } = pide;
  let final = null, probadas = 0;

  function dfs(s, hist, cosechas) {
    const d = hist.length;
    if (d === L) {
      const vale = !terminaCosechando || (cosechas >= cosechasMin && hist[d - 1].cosecha);
      if (vale) final = Array.from(s.height);
      return vale ? hist.slice() : null;
    }
    const quedan = L - d;
    // Podas: el paso del último turno no puede pasar de las celdas vivas, y si hay
    // que acabar cosechando, alguna celda tiene que poder llegar a abeja a tiempo.
    if (s.step + quedan - 1 > vivas) return null;
    if (terminaCosechando) {
      let cerca = Infinity;
      for (let i = 0; i < s.height.length; i++) if (M.existe(s, i)) cerca = Math.min(cerca, hastaCosecha(s.height[i]));
      if (cerca > quedan) return null;
    }

    let js = jugadas(s);
    if (quedan === 1 && terminaCosechando) js = js.filter(c => s.height[c[0]] === M.MAX_LEVEL);   // la última, cosecha
    for (const cells of ordenar(s, js, a).slice(0, MUESTRA)) {
      if (++probadas > presupuesto) return null;
      const h = s.height[cells[0]];
      const c = copiar(s);
      M.commitTurn(c, cells);
      if (c.last.type === 'fallback' && quedan > 1) continue;   // callejón: se prueba otra
      hist.push({ cells, nivel: h, cosecha: h === M.MAX_LEVEL });
      const r = dfs(c, hist, cosechas + (h === M.MAX_LEVEL ? 1 : 0));
      if (r) return r;
      hist.pop();                                                // marcha atrás
      if (probadas > presupuesto) return null;
    }
    return null;
  }

  const historia = dfs(s0, [], 0);
  return { historia, final, probadas };
}

module.exports = { partidaGuia };
