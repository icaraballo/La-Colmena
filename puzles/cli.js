// La máquina de puzles (T-46) · los comandos.
//
//   npm run puzles -- generar   [--tipo marcadas,rojas] [--forma "cuello 15"|huecos] [--turnos 6-9]
//                               [--nota medio,difícil] [--cuantos 20] [--segundos 300] [--semilla 7]
//                               [--por-tipo 15] [--uno] [--sin-nota] [--hilos N]
//   npm run puzles -- comprobar [lote]     rejuega todas las soluciones
//   npm run puzles -- evaluar   [lote]     (re)calcula las notas
//   npm run puzles -- resumen   [lote]     tabla por tipo, nota, mínimo y forma
//   npm run puzles -- meter     <seleccion.json> [--capitulo N]   → js/puzles.js
//   npm run puzles -- verificar                comprueba js/puzles.js y js/tutorial.js con el motor actual
//   npm run puzles -- repescar  [agotadas] [--segundos 60] [--hilos N]
//                               repite con más paciencia lo que el resolutor no terminó
//
// --por-tipo N genera tipo a tipo hasta tener N de cada uno (o de los de --tipo), en
// un solo lote. Para reproducir un candidato con --uno, pásale también su --tipo.
//
// [lote] es la ruta de un .jsonl, su nombre dentro de puzles/salida/, o nada (el
// último). [agotadas] igual, con los agotadas-*.json que deja `generar`.
//
// La segunda pasada (repescar, 02-10): `generar` da al resolutor 4 s por puzle y
// descarta lo que no termina, que suelen ser puzles largos (mínimo 6-10). Las
// semillas de esos intentos quedan en salida/agotadas-<fecha>.json; `repescar` las
// repite con el presupuesto de --segundos (60 por defecto) y escribe lo que sale en
// un lote nuevo. Lo que sigue sin terminar se queda en el fichero, para otra pasada
// con más tiempo. Es trabajo de fondo: para dejarlo de noche. <seleccion.json> es lo que exporta el editor (puzles/editor.html).
//
// Los intentos se reparten entre los núcleos (worker_threads), como en tests/bot.js.
// Cada intento depende sólo de su semilla (la del lote mezclada con su número), así
// que el lote es el mismo en uno que en diez núcleos. Con --cuantos se reparten los
// intentos en orden y, al acabar, se cuentan en orden: con la misma semilla y las
// mismas opciones sale el mismo lote (salvo que el reloj corte: --segundos, o el
// presupuesto en milisegundos del resolutor en una máquina muy cargada).
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

// ---------------------------------------------------------------------------
// El hilo: carga la máquina una vez y va pidiendo trabajo.
// ---------------------------------------------------------------------------
function hilo() {
  const { mezclar } = require('./motor.js');
  const { intento } = require('./generador.js');
  const { evaluar } = require('./evaluador.js');
  parentPort.on('message', t => {
    const res = [];
    if (t.que === 'intentos') {
      for (let k = t.desde; k < t.hasta; k++) {
        const semilla = mezclar(t.semillaLote, k);
        try { res.push({ k, semilla, ...intento(semilla, t.op) }); }
        catch (e) { res.push({ k, error: `${e.message} (semilla ${semilla})` }); }
      }
    } else if (t.que === 'repesca') {
      const { semilla, op } = t;
      try { res.push({ semilla, ...intento(semilla, op) }); }
      catch (e) { res.push({ semilla, error: `${e.message} (semilla ${semilla})` }); }
    } else if (t.que === 'evaluar') {
      for (const c of t.candidatos) res.push({ ...c, eval: evaluar(c, { n: t.partidas, semilla: c.semilla }) });
    }
    parentPort.postMessage(res);
  });
}

// Reparte las tareas entre hilos. `siguiente()` da la próxima tarea o null;
// `alRecibir(res)` recibe cada resultado.
function repartir(hilos, siguiente, alRecibir) {
  return new Promise((ok, mal) => {
    let vivos = hilos;
    for (let i = 0; i < hilos; i++) {
      const w = new Worker(__filename);
      const dar = () => {
        const t = siguiente();
        if (t) return w.postMessage(t);
        w.terminate();
        if (--vivos === 0) ok();
      };
      w.on('message', r => { alRecibir(r); dar(); });
      w.on('error', mal);
      dar();
    }
  });
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function leerArgs(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2);
    if (['uno', 'sin-nota'].includes(k)) o[k] = true;
    else if (i + 1 < args.length) o[k] = args[++i];
    else throw new Error(`falta el valor de --${k}`);
  }
  return o;
}
const lista = s => s.split(',').map(x => x.trim()).filter(Boolean);
const hilosDe = a => Math.max(1, Number(a.hilos) || os.cpus().length);

async function principal() {
  const [orden, ...resto] = process.argv.slice(2);
  const a = leerArgs(resto);
  const ordenes = { generar, comprobar: comprobarLote, evaluar: evaluarLote, resumen, meter, verificar, repescar };
  if (!ordenes[orden]) {
    console.error('Uso: npm run puzles -- generar | comprobar | evaluar | resumen | meter | verificar | repescar  (ver puzles/cli.js)');
    process.exit(1);
  }
  await ordenes[orden](a);
}

// ---------------------------------------------------------------------------
// generar
// ---------------------------------------------------------------------------
async function generar(a) {
  const { OPCIONES, intento } = require('./generador.js');
  const { NOTAS } = require('./evaluador.js');
  const { NOMBRES_FORMAS } = require('./formas.js');
  const { crearRegistro, SALIDA } = require('./registro.js');
  const { comprobar } = require('./comprobador.js');

  const op = {};
  if (a.tipo) {
    op.tipos = lista(a.tipo);
    const malos = op.tipos.filter(t => !OPCIONES.tipos.includes(t));
    if (malos.length) throw new Error(`tipo desconocido: ${malos.join(', ')}. Hay: ${OPCIONES.tipos.join(', ')}`);
  }
  if (a.forma) {
    if (!NOMBRES_FORMAS.includes(a.forma)) throw new Error(`forma desconocida: ${a.forma}. Hay: ${NOMBRES_FORMAS.join(', ')}`);
    op.forma = a.forma;
  }
  if (a.turnos) {
    const m = /^(\d+)-(\d+)$/.exec(a.turnos);
    if (!m || +m[1] < 1 || +m[1] > +m[2]) throw new Error('--turnos va como 6-9');
    op.turnos = [+m[1], +m[2]];
  }
  if (a['sin-nota']) op.evaluar = false;
  const notas = a.nota ? lista(a.nota) : null;
  if (notas) {
    if (op.evaluar === false) throw new Error('--nota necesita la nota: quita --sin-nota');
    const malas = notas.filter(n => !NOTAS.includes(n));
    if (malas.length) throw new Error(`nota desconocida: ${malas.join(', ')}. Hay: ${NOTAS.join(', ')}`);
  }

  // --uno: un solo intento con esa semilla, en pantalla. Reproduce un candidato
  // (con las mismas opciones con que se generó).
  if (a.uno) {
    if (!a.semilla) throw new Error('--uno necesita --semilla (la del candidato)');
    const r = intento(Number(a.semilla) >>> 0, op);
    if (r.descarte) { console.log(`Con la semilla ${a.semilla}: descartado (${r.descarte}).`); return; }
    console.log(JSON.stringify(r.candidato, null, 1));
    console.log(`Comprobador: ${comprobar(r.candidato)}`);
    return;
  }

  const segundos = Number(a.segundos) || 300;
  const semillaLote = (a.semilla !== undefined ? Number(a.semilla) : Date.now() % 1e9) >>> 0;
  const hilos = hilosDe(a);
  const TROZO = 4;
  const { mezclar } = require('./motor.js');

  // Las tandas. Sin --por-tipo, una: los tipos al azar, como siempre. Con
  // --por-tipo N, una por tipo hasta tener N de cada uno (LC-Instrucciones §9.8: los
  // tipos caros, como rojas, salen igualmente). Cada tanda tiene su semilla, sacada
  // de la del lote; todo va al mismo lote.
  const porTipo = a['por-tipo'] !== undefined ? Number(a['por-tipo']) : null;
  if (porTipo !== null && !(porTipo >= 1)) throw new Error('--por-tipo va con un número: --por-tipo 15');
  const tipos = op.tipos || OPCIONES.tipos;
  const tandas = porTipo
    ? tipos.map((t, f) => ({ nombre: t, op: { ...op, tipos: [t] }, cuantos: porTipo, semilla: mezclar(semillaLote, f + 1) }))
    : [{ nombre: null, op, cuantos: Number(a.cuantos) || 20, semilla: semillaLote }];
  const pedidos = tandas.reduce((n, t) => n + t.cuantos, 0);

  console.log(`Generando ${pedidos} puzles${porTipo ? ` (${porTipo} de cada tipo)` : ''} (semilla ${semillaLote}, ${hilos} núcleos, máximo ${segundos} s)…`);
  // Lo que ya existía, y lo de esta tanda, para no contar repetidos.
  const registro = crearRegistro(), vistosAhora = new Set();
  const t0 = Date.now();
  const tiempo = () => Math.round((Date.now() - t0) / 1000);
  const descartes = {}, elegidos = [], errores = [], faltan = [], agotadas = [];
  const descarta = m => { descartes[m] = (descartes[m] || 0) + 1; };
  let intentos = 0;

  for (const tanda of tandas) {
    const resultados = [];
    let siguienteK = 0, buenos = 0, ultimoAviso = Date.now();
    const quien = tanda.nombre ? `${tanda.nombre}: ` : '';
    await repartir(hilos, () => {
      if (buenos >= tanda.cuantos || Date.now() - t0 > segundos * 1000) return null;
      const t = { que: 'intentos', desde: siguienteK, hasta: siguienteK + TROZO, semillaLote: tanda.semilla, op: tanda.op };
      siguienteK += TROZO;
      return t;
    }, res => {
      for (const r of res) {
        resultados.push(r);
        const c = r.candidato;
        if (c && (!notas || notas.includes(c.eval.nota)) && !registro.tiene(c.huella) && !vistosAhora.has(c.huella)) {
          vistosAhora.add(c.huella); buenos++;
        }
      }
      if (Date.now() - ultimoAviso > 3000) {
        ultimoAviso = Date.now();
        console.log(`  ${quien}${Math.min(buenos, tanda.cuantos)}/${tanda.cuantos} puzles · ${resultados.length} intentos · ${tiempo()} s`);
      }
    });

    // En orden de intento: así el lote no depende de qué núcleo acabó antes.
    resultados.sort((x, y) => x.k - y.k);
    intentos += resultados.length;
    let deEsta = 0;
    for (const r of resultados) {
      if (r.error) { errores.push(r); continue; }
      if (r.descarte) {
        descarta(r.descarte);
        if (esAgotado(r.descarte)) agotadas.push({ semilla: r.semilla, op: tanda.op });
        continue;
      }
      if (deEsta >= tanda.cuantos) { descarta('sobran (ya hay los pedidos)'); continue; }
      if (notas && !notas.includes(r.candidato.eval.nota)) { descarta('nota fuera de lo pedido'); continue; }
      if (!registro.apuntar(r.candidato.huella)) { descarta('repetido'); continue; }
      elegidos.push(r.candidato); deEsta++;
    }
    if (tanda.nombre) console.log(`  ${quien}${deEsta}/${tanda.cuantos} · ${tiempo()} s`);
    if (deEsta < tanda.cuantos) faltan.push(`${tanda.nombre || 'puzles'}: ${tanda.cuantos - deEsta}`);
  }

  if (elegidos.length) {
    const fichero = escribirLote(elegidos, SALIDA, { semillaLote, op, notas, porTipo });
    console.log(`\nLote: ${path.relative(process.cwd(), fichero)}`);
  }
  console.log(`\n${elegidos.length} puzles de ${intentos} intentos en ${tiempo()} s.`);
  if (faltan.length) console.log(`Faltan (se acabó el tiempo, --segundos ${segundos}): ${faltan.join(' · ')}.`);
  console.log('Descartes:');
  for (const [m, n] of Object.entries(descartes).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(5)}  ${m}`);
  if (agotadas.length) {
    const f = escribirAgotadas(agotadas, SALIDA, { semillaLote });
    console.log(`Las ${agotadas.length} que el resolutor no terminó quedan en ${path.relative(process.cwd(), f)}: \`npm run puzles -- repescar\`.`);
  }
  if (elegidos.length) tablas(elegidos);
  if (errores.length) {
    console.error(`\n${errores.length} ERRORES de la máquina (no son descartes):`);
    for (const e of errores.slice(0, 5)) console.error('  ' + e.error);
    process.exit(1);
  }
}

const esAgotado = d => d.startsWith('el resolutor no termina');

// Fecha y hora para los nombres de fichero: 20261002 y 1730.
function sello() {
  const d = new Date(), dos = n => String(n).padStart(2, '0');
  return { fecha: `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}`, hora: `${dos(d.getHours())}${dos(d.getMinutes())}` };
}

// Las semillas que el resolutor no terminó, con las opciones de su tanda (el tipo
// entra en ellas: con --por-tipo, cada tanda tiene el suyo).
function escribirAgotadas(agotadas, dir, info) {
  fs.mkdirSync(dir, { recursive: true });
  const { fecha, hora } = sello();
  let base = `agotadas-${fecha}-${hora}`, n = 2;
  while (fs.existsSync(path.join(dir, base + '.json'))) base = `agotadas-${fecha}-${hora}-${n++}`;
  const f = path.join(dir, base + '.json');
  fs.writeFileSync(f, JSON.stringify({ ...info, agotadas }, null, 1) + '\n');
  return f;
}

// Escribe el lote dos veces: .jsonl para los scripts y .js (window.LOTE) para que el
// editor lo cargue con <script src> abriéndolo como fichero (regla 4).
function escribirLote(candidatos, dir, info) {
  fs.mkdirSync(dir, { recursive: true });
  const { fecha, hora } = sello();
  let base = `lote-${fecha}-${hora}`, n = 2;
  while (fs.existsSync(path.join(dir, base + '.jsonl'))) base = `lote-${fecha}-${hora}-${n++}`;
  candidatos.forEach((c, i) => { c.id = `L${fecha}-${hora}-${String(i + 1).padStart(2, '0')}`; c.lote = base; });
  // El id primero, para que se lea bien.
  const filas = candidatos.map(({ id, ...c }) => JSON.stringify({ id, ...c }));
  fs.writeFileSync(path.join(dir, base + '.jsonl'), filas.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, base + '.js'),
    `// ${base}: generado por \`npm run puzles -- generar\` (${JSON.stringify(info)}).\n` +
    `// No se versiona. Lo carga puzles/editor.html.\nwindow.LOTE = [\n${filas.join(',\n')}\n];\n`);
  escribirIndice(dir);
  return path.join(dir, base + '.jsonl');
}

// El índice de lotes para el editor: abierto como fichero, una página no puede
// listar una carpeta, así que se lo da hecho salida/lotes.js (window.LOTES, del más
// antiguo al más nuevo).
function escribirIndice(dir) {
  const { lotes, leerLote } = require('./registro.js');
  const LOTES = lotes(dir).map(f => ({ nombre: path.basename(f, '.jsonl'), puzles: leerLote(f).length }));
  fs.writeFileSync(path.join(dir, 'lotes.js'),
    `// Índice de los lotes de puzles/salida/, para el editor. Lo reescribe \`npm run puzles -- generar\`.\n` +
    `window.LOTES = ${JSON.stringify(LOTES, null, 1)};\n`);
}

// ---------------------------------------------------------------------------
// comprobar, evaluar, resumen
// ---------------------------------------------------------------------------
function rutaLote(nombre) {
  const { lotes, SALIDA } = require('./registro.js');
  if (!nombre) {
    const todos = lotes();
    if (!todos.length) throw new Error('no hay lotes en puzles/salida/: genera uno con `npm run puzles -- generar`');
    return todos[todos.length - 1];
  }
  for (const r of [nombre, path.join(SALIDA, nombre), path.join(SALIDA, nombre + '.jsonl')])
    if (fs.existsSync(r) && r.endsWith('.jsonl')) return r;
  throw new Error(`no encuentro el lote ${nombre}`);
}

function comprobarLote(a) {
  const { leerLote } = require('./registro.js');
  const { comprobar } = require('./comprobador.js');
  const f = rutaLote(a._[0]);
  const cs = leerLote(f);
  const res = {};
  let mal = 0;
  for (const c of cs) {
    const r = comprobar(c);
    if (r !== 'ok') { mal++; console.log(`  ${c.id}: ${r}`); }
    const k = `${c.tipo}: ${r === 'ok' ? 'ok' : 'MAL'}`;
    res[k] = (res[k] || 0) + 1;
  }
  console.log(`${path.basename(f)}: ${cs.length} puzles, ${cs.length - mal} bien.`);
  for (const [k, v] of Object.entries(res).sort()) console.log(`  ${k} ${v}`);
  if (mal) process.exit(1);
}

async function evaluarLote(a) {
  const { leerLote } = require('./registro.js');
  const { OPCIONES } = require('./generador.js');
  const f = rutaLote(a._[0]);
  const cs = leerLote(f);
  const hilos = Math.min(hilosDe(a), cs.length);
  console.log(`Evaluando ${cs.length} puzles en ${hilos} núcleos…`);
  const cola = cs.map(c => ({ que: 'evaluar', candidatos: [c], partidas: OPCIONES.partidasEval }));
  const porId = new Map();
  await repartir(hilos, () => cola.shift() || null, res => { for (const c of res) porId.set(c.id, c); });
  const nuevos = cs.map(c => porId.get(c.id));
  // Reescribe el lote con las notas nuevas, en el mismo sitio.
  const filas = nuevos.map(c => JSON.stringify(c));
  fs.writeFileSync(f, filas.join('\n') + '\n');
  const js = f.replace(/\.jsonl$/, '.js');
  const cab = fs.existsSync(js) ? fs.readFileSync(js, 'utf8').split('window.LOTE')[0] : '';
  fs.writeFileSync(js, `${cab}window.LOTE = [\n${filas.join(',\n')}\n];\n`);
  console.log(`Notas recalculadas en ${path.basename(f)}.`);
  tablas(nuevos);
}

function resumen(a) {
  const { leerLote } = require('./registro.js');
  const f = rutaLote(a._[0]);
  const cs = leerLote(f);
  console.log(`${path.basename(f)}: ${cs.length} puzles`);
  tablas(cs);
}

// ---------------------------------------------------------------------------
// meter y verificar: js/puzles.js, lo único que lee el juego (§5.60)
// ---------------------------------------------------------------------------
const PUZLES_JS = path.join(__dirname, '..', 'js', 'puzles.js');
// Los tipos que presenta cada capítulo (LC-DESIGN §23; provisional, se ajusta
// jugando). La pantalla de capítulos los dice («+ celdas en total y cosecha grande»).
const NUEVOS_CAPITULO = { 0: [], 1: ['marcadas', 'cosechas'], 2: ['total', 'grande'], 3: ['escalera', 'panal'],
  4: ['combinado', 'rojas'], 5: ['orden'] };

function leerPuzlesJs() {
  if (!fs.existsSync(PUZLES_JS)) return { CAPITULOS: [], PUZLES: [] };
  const vm = require('vm');
  return vm.runInNewContext(fs.readFileSync(PUZLES_JS, 'utf8') + '\n({ PUZLES_VERSION, CAPITULOS, PUZLES })', {});
}

// Un nivel del juego, jugado con el MOTOR DEL JUEGO (crearPuzle, el modo Puzzle de
// verdad) con su solución: tiene que ganar con ★★★ en su mínimo.
function jugarConElJuego(p) {
  const { M } = require('./motor.js');
  const s = M.crearPuzle(p);
  for (const c of p.solucion) if (!M.commitTurn(s, c)) return 'el juego rechaza una jugada de la solución';
  const r = s.puzle.resultado;
  if (!r) return 'el juego no da el nivel por acabado';
  if (!r.gana) return `el juego lo da por perdido (${r.motivo})`;
  if (r.turnos !== p.minimo || r.estrellas !== 3) return `el juego da ${r.estrellas} estrellas en ${r.turnos}`;
  return 'ok';
}
// ¿Sigue siendo su mínimo? El resolutor no encuentra nada más corto.
function minimoSigue(p) {
  const { buscar } = require('./buscador.js');
  const { juegoDeNivel } = require('./colmena.js');
  const r = buscar(juegoDeNivel(p), { maxProf: p.minimo, maxEstados: 2e6, maxMs: 60000 });
  if (r.agotado) return 'el resolutor no termina';
  if (!r.resuelto) return 'el resolutor ya no lo resuelve';
  return r.minimo === p.minimo ? 'ok' : `el mínimo ha bajado a ${r.minimo}`;
}

async function meter(a) {
  const { comprobar } = require('./comprobador.js');
  const f = a._[0];
  if (!f || !fs.existsSync(f)) throw new Error('npm run puzles -- meter <seleccion.json> [--capitulo N]  (la exporta el editor)');
  const sel = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (sel.version !== 1 || !Array.isArray(sel.capitulos)) throw new Error(`${f} no es una selección del editor`);
  let caps = sel.capitulos;
  if (a.capitulo !== undefined) caps = caps.filter(c => c.capitulo === Number(a.capitulo));
  if (!caps.length) throw new Error('la selección no trae ese capítulo');

  // No se fía del lote: cada puzle se vuelve a comprobar, a jugar con el juego y a resolver.
  const nuevos = [];
  let mal = 0;
  for (const c of caps) for (const p of c.puzles) {
    const nivel = { tablero: p.nivel.tablero, rotas: p.nivel.rotas, height: p.nivel.height, paso: p.nivel.paso, objetivo: p.nivel.objetivo };
    const id = `C${c.capitulo}-${String(p.orden).padStart(2, '0')}`;
    const juego = { id, ...nivel, minimo: p.minimo, solucion: p.solucion };
    const pruebas = [comprobar({ nivel, solucion: p.solucion, minimo: p.minimo }), jugarConElJuego(juego), minimoSigue(juego)];
    const fallo = pruebas.find(x => x !== 'ok');
    if (fallo) { mal++; console.log(`  ${p.id} (capítulo ${c.capitulo}): ${fallo}`); continue; }
    nuevos.push({ id, capitulo: c.capitulo, orden: p.orden, ...nivel, minimo: p.minimo, solucion: p.solucion,
      origen: { lote: p.lote, id: p.id, semilla: p.semilla, forma: p.forma,
                nota: p.eval ? p.eval.nota : null, notaInigo: p.valoracion ? p.valoracion.dificultad : null,
                ...(sel.provisional ? { provisional: true } : {}) } });
  }
  if (mal) throw new Error(`${mal} puzles no pasan: no se toca js/puzles.js`);

  // Los capítulos de la selección se sustituyen enteros; los demás se quedan.
  const antes = leerPuzlesJs();
  const tocados = new Set(caps.map(c => c.capitulo));
  const PUZLES = [...antes.PUZLES.filter(p => !tocados.has(p.capitulo)), ...nuevos]
    .sort((x, y) => x.capitulo - y.capitulo || x.orden - y.orden);
  const ns = [...new Set(PUZLES.map(p => p.capitulo))].sort((x, y) => x - y);
  const CAPITULOS = ns.map(n => ({ n, nuevos: NUEVOS_CAPITULO[n] || [] }));
  // Provisional mientras quede algún nivel que no eligió Iñigo.
  const provisionales = PUZLES.filter(p => p.origen && p.origen.provisional).length;
  escribirPuzlesJs(CAPITULOS, PUZLES, provisionales > 0);
  if (provisionales) console.log(`Aviso: ${provisionales} niveles son de la selección provisional (no los eligió Iñigo).`);
  console.log(`js/puzles.js: ${PUZLES.length} niveles en ${ns.length} capítulos (${[...tocados].sort().map(n => `capítulo ${n}: ${nuevos.filter(p => p.capitulo === n).length}`).join(', ')}).`);
  console.log('Siguiente: npm test, jugarlo, y el commit. El push publica el juego: lo decide Iñigo.');
}

// Siempre igual para el mismo contenido: un nivel por línea, para que el diff se lea.
function escribirPuzlesJs(CAPITULOS, PUZLES, provisional) {
  const linea = p => '  ' + JSON.stringify(p) + ',';
  fs.writeFileSync(PUZLES_JS, `// Los niveles del modo Puzzle (v11). Los escribe \`npm run puzles -- meter\`, no a mano:
// cada uno lo ha generado la máquina de puzles/, lo ha demostrado el resolutor, lo
// ha rejugado el comprobador, lo ha ganado el juego con ★★★ y lo ha elegido Iñigo.
// \`npm run puzles -- verificar\` (y npm test) comprueban que siguen valiendo.
${provisional ? '// PROVISIONAL: la selección no es de Iñigo (la hizo Claude para poder probar el modo).\n// No se publica así: se sustituye por la que exporte Iñigo desde el editor.\n' : ''}const PUZLES_VERSION = 1;
const CAPITULOS = [
${CAPITULOS.map(c => '  ' + JSON.stringify(c) + ',').join('\n')}
];
const PUZLES = [
${PUZLES.map(linea).join('\n')}
];
`);
}

// ---------------------------------------------------------------------------
// repescar: la segunda pasada
// ---------------------------------------------------------------------------
// Estados: el mismo tope que el buscador por defecto. Con 10 núcleos a la vez, más
// sería demasiada memoria; de los 16 medidos el 02-10, sin tope, ninguno pasó de 720.000.
const REPESCA_ESTADOS = 2e6;

function rutaAgotadas(nombre) {
  const { SALIDA } = require('./registro.js');
  if (!nombre) {
    const todos = fs.existsSync(SALIDA) ? fs.readdirSync(SALIDA).filter(f => /^agotadas-.*\.json$/.test(f)).sort() : [];
    if (!todos.length) throw new Error('no hay agotadas-*.json en puzles/salida/: las deja `generar` cuando el resolutor no termina alguno');
    return path.join(SALIDA, todos[todos.length - 1]);
  }
  for (const r of [nombre, path.join(SALIDA, nombre), path.join(SALIDA, nombre + '.json')])
    if (fs.existsSync(r) && r.endsWith('.json')) return r;
  throw new Error(`no encuentro ${nombre}`);
}

async function repescar(a) {
  const { crearRegistro, SALIDA } = require('./registro.js');
  const f = rutaAgotadas(a._[0]);
  const datos = JSON.parse(fs.readFileSync(f, 'utf8'));
  const segundos = Number(a.segundos) || 60;
  const resolutor = { maxEstados: REPESCA_ESTADOS, maxMs: segundos * 1000 };
  const cola = datos.agotadas.map(x => ({ que: 'repesca', semilla: x.semilla, op: { ...x.op, resolutor } }));
  const hilos = Math.min(hilosDe(a), cola.length);
  console.log(`Repescando ${cola.length} intentos de ${path.basename(f)} con ${segundos} s cada uno (${hilos} núcleos; como mucho unos ${Math.ceil(cola.length / hilos * segundos * 1.5 / 60)} min)…`);

  const t0 = Date.now();
  const tiempo = () => Math.round((Date.now() - t0) / 1000);
  const resultados = [];
  let ultimoAviso = Date.now();
  await repartir(hilos, () => cola.shift() || null, res => {
    resultados.push(...res);
    if (Date.now() - ultimoAviso > 3000) {
      ultimoAviso = Date.now();
      console.log(`  ${resultados.length}/${datos.agotadas.length} · ${resultados.filter(r => r.candidato).length} puzles · ${tiempo()} s`);
    }
  });

  // En el orden del fichero: así el lote no depende de qué núcleo acabó antes.
  const orden = new Map(datos.agotadas.map((x, i) => [x.semilla, i]));
  resultados.sort((x, y) => orden.get(x.semilla) - orden.get(y.semilla));
  const registro = crearRegistro();
  const elegidos = [], siguen = [], errores = [], descartes = {};
  let porEstados = 0;
  for (const r of resultados) {
    if (r.error) { errores.push(r); continue; }
    if (r.descarte) {
      descartes[r.descarte] = (descartes[r.descarte] || 0) + 1;
      if (esAgotado(r.descarte)) {
        siguen.push(datos.agotadas[orden.get(r.semilla)]);
        if (r.descarte.includes('estados')) porEstados++;
      }
      continue;
    }
    if (!registro.apuntar(r.candidato.huella)) { descartes.repetido = (descartes.repetido || 0) + 1; continue; }
    elegidos.push(r.candidato);
  }

  if (elegidos.length) {
    const lote = escribirLote(elegidos, SALIDA, { repesca: path.basename(f), segundos });
    console.log(`\nLote: ${path.relative(process.cwd(), lote)}`);
  }
  console.log(`\n${elegidos.length} puzles de ${resultados.length} intentos en ${tiempo()} s.`);
  for (const [m, n] of Object.entries(descartes).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(5)}  ${m}`);
  // Lo que sigue sin terminar se queda para otra pasada; si no queda nada, el fichero sobra.
  if (siguen.length) {
    fs.writeFileSync(f, JSON.stringify({ ...datos, agotadas: siguen }, null, 1) + '\n');
    const porTiempo = siguen.length - porEstados;
    console.log(`Siguen sin terminar ${siguen.length}: quedan en ${path.basename(f)}.` +
      (porTiempo ? ` ${porTiempo} por tiempo: prueba con más --segundos.` : '') +
      (porEstados ? ` ${porEstados} por estados (el tope de ${REPESCA_ESTADOS.toLocaleString('es-ES')}, por la memoria): más tiempo no los arregla.` : ''));
  } else fs.unlinkSync(f);
  if (elegidos.length) tablas(elegidos);
  if (errores.length) {
    console.error(`\n${errores.length} ERRORES de la máquina (no son descartes):`);
    for (const e of errores.slice(0, 5)) console.error('  ' + e.error);
    process.exit(1);
  }
}

// El tutorial (v11.2, T-49) vive aparte, en js/tutorial.js, y no lo pisa `meter`;
// pero se verifica igual, más el comprobador (está hecho a mano, no sale de un lote).
function leerTutorialJs() {
  const f = path.join(path.dirname(PUZLES_JS), 'tutorial.js');
  if (!fs.existsSync(f)) return [];
  return require('vm').runInNewContext(fs.readFileSync(f, 'utf8') + '\nTUTORIAL', {});
}
function verificar() {
  const { comprobar } = require('./comprobador.js');
  const { PUZLES } = leerPuzlesJs();
  const TUTORIAL = leerTutorialJs();
  if (!PUZLES.length && !TUTORIAL.length) { console.log('js/puzles.js no tiene niveles.'); return; }
  let mal = 0, malT = 0;
  for (const p of PUZLES) {
    const r = [jugarConElJuego(p), minimoSigue(p)].find(x => x !== 'ok');
    if (r) { mal++; console.log(`  ${p.id}: ${r}`); }
  }
  console.log(`js/puzles.js: ${PUZLES.length} niveles, ${PUZLES.length - mal} bien.`);
  for (const t of TUTORIAL) {
    const r = [comprobar({ nivel: t, solucion: t.solucion, minimo: t.minimo }), jugarConElJuego(t), minimoSigue(t)].find(x => x !== 'ok');
    if (r) { malT++; console.log(`  ${t.id}: ${r}`); }
  }
  if (TUTORIAL.length) console.log(`js/tutorial.js: ${TUTORIAL.length} niveles, ${TUTORIAL.length - malT} bien.`);
  if (mal || malT) process.exit(1);
}

// Las tablas del resumen: por tipo × nota, por mínimo y por forma.
function tablas(cs) {
  const { NOTAS } = require('./evaluador.js');
  const cuenta = (f) => { const m = {}; for (const c of cs) { const k = f(c); m[k] = (m[k] || 0) + 1; } return m; };
  const conNota = cs.some(c => c.eval);
  console.log('\nPor tipo' + (conNota ? ' y nota:' : ':'));
  const tipos = [...new Set(cs.map(c => c.tipo))].sort();
  const ancho = Math.max(...tipos.map(t => t.length), 4);
  if (conNota) {
    console.log('  ' + 'tipo'.padEnd(ancho) + NOTAS.map(n => n.padStart(12)).join('') + '   total');
    for (const t of tipos) {
      const de = cs.filter(c => c.tipo === t);
      console.log('  ' + t.padEnd(ancho) + NOTAS.map(n => String(de.filter(c => c.eval && c.eval.nota === n).length).padStart(12)).join('') + String(de.length).padStart(8));
    }
  } else for (const t of tipos) console.log(`  ${t.padEnd(ancho)} ${cs.filter(c => c.tipo === t).length}`);
  const porMin = cuenta(c => c.minimo);
  console.log('\nPor mínimo de turnos:  ' + Object.keys(porMin).sort((x, y) => x - y).map(k => `${k} → ${porMin[k]}`).join(' · '));
  const porForma = cuenta(c => c.forma);
  console.log('Por forma:  ' + Object.entries(porForma).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
}

// Al final: así todo lo de arriba ya está definido.
if (!isMainThread) hilo();
else principal().catch(e => { console.error(e.message || e); process.exit(1); });
