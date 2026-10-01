// La máquina de puzles (T-46) · los comandos.
//
//   npm run puzles -- generar   [--tipo marcadas,rojas] [--forma "cuello 15"|huecos] [--turnos 6-9]
//                               [--nota medio,difícil] [--cuantos 20] [--segundos 300] [--semilla 7]
//                               [--uno] [--sin-nota] [--hilos N]
//   npm run puzles -- comprobar [lote]     rejuega todas las soluciones
//   npm run puzles -- evaluar   [lote]     (re)calcula las notas
//   npm run puzles -- resumen   [lote]     tabla por tipo, nota, mínimo y forma
//
// [lote] es la ruta de un .jsonl, su nombre dentro de puzles/salida/, o nada (el
// último). `meter` y `verificar` llegan en la F3, con js/puzles.js.
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
        try { res.push({ k, ...intento(semilla, t.op) }); }
        catch (e) { res.push({ k, error: `${e.message} (semilla ${semilla})` }); }
      }
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
  const ordenes = { generar, comprobar: comprobarLote, evaluar: evaluarLote, resumen };
  if (!ordenes[orden]) {
    console.error('Uso: npm run puzles -- generar | comprobar | evaluar | resumen  (ver puzles/cli.js)');
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

  const cuantos = Number(a.cuantos) || 20;
  const segundos = Number(a.segundos) || 300;
  const semillaLote = (a.semilla !== undefined ? Number(a.semilla) : Date.now() % 1e9) >>> 0;
  const hilos = hilosDe(a);
  const TROZO = 4;

  console.log(`Generando ${cuantos} puzles (semilla ${semillaLote}, ${hilos} núcleos, máximo ${segundos} s)…`);
  const resultados = [];
  // La cuenta mientras se genera: sin lo que ya existía ni lo repetido en esta tanda.
  const registro = crearRegistro(), vistosAhora = new Set();
  let siguienteK = 0, buenos = 0, ultimoAviso = Date.now();
  const t0 = Date.now();
  const tiempo = () => Math.round((Date.now() - t0) / 1000);
  await repartir(hilos, () => {
    if (buenos >= cuantos || Date.now() - t0 > segundos * 1000) return null;
    const t = { que: 'intentos', desde: siguienteK, hasta: siguienteK + TROZO, semillaLote, op };
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
      console.log(`  ${Math.min(buenos, cuantos)}/${cuantos} puzles · ${resultados.length} intentos · ${tiempo()} s`);
    }
  });

  // En orden de intento: así el lote no depende de qué núcleo acabó antes.
  resultados.sort((x, y) => x.k - y.k);
  const errores = resultados.filter(r => r.error);
  const descartes = {}, elegidos = [];
  const descarta = m => { descartes[m] = (descartes[m] || 0) + 1; };
  for (const r of resultados) {
    if (r.error) continue;
    if (r.descarte) { descarta(r.descarte); continue; }
    if (elegidos.length >= cuantos) { descarta('sobran (ya hay los pedidos)'); continue; }
    if (notas && !notas.includes(r.candidato.eval.nota)) { descarta('nota fuera de lo pedido'); continue; }
    if (!registro.apuntar(r.candidato.huella)) { descarta('repetido'); continue; }
    elegidos.push(r.candidato);
  }

  if (elegidos.length) {
    const fichero = escribirLote(elegidos, SALIDA, { semillaLote, op, notas });
    console.log(`\nLote: ${path.relative(process.cwd(), fichero)}`);
  }
  console.log(`\n${elegidos.length} puzles de ${resultados.length} intentos en ${tiempo()} s.`);
  if (elegidos.length < cuantos) console.log(`Faltan ${cuantos - elegidos.length}: se acabó el tiempo (--segundos ${segundos}).`);
  console.log('Descartes:');
  for (const [m, n] of Object.entries(descartes).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(5)}  ${m}`);
  if (elegidos.length) tablas(elegidos);
  if (errores.length) {
    console.error(`\n${errores.length} ERRORES de la máquina (no son descartes):`);
    for (const e of errores.slice(0, 5)) console.error('  ' + e.error);
    process.exit(1);
  }
}

// Escribe el lote dos veces: .jsonl para los scripts y .js (window.LOTE) para que el
// editor lo cargue con <script src> abriéndolo como fichero (regla 4).
function escribirLote(candidatos, dir, info) {
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date(), dos = n => String(n).padStart(2, '0');
  const fecha = `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}`, hora = `${dos(d.getHours())}${dos(d.getMinutes())}`;
  let base = `lote-${fecha}-${hora}`, n = 2;
  while (fs.existsSync(path.join(dir, base + '.jsonl'))) base = `lote-${fecha}-${hora}-${n++}`;
  candidatos.forEach((c, i) => { c.id = `L${fecha}-${hora}-${String(i + 1).padStart(2, '0')}`; c.lote = base; });
  // El id primero, para que se lea bien.
  const filas = candidatos.map(({ id, ...c }) => JSON.stringify({ id, ...c }));
  fs.writeFileSync(path.join(dir, base + '.jsonl'), filas.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, base + '.js'),
    `// ${base}: generado por \`npm run puzles -- generar\` (${JSON.stringify(info)}).\n` +
    `// No se versiona. Lo carga puzles/editor.html.\nwindow.LOTE = [\n${filas.join(',\n')}\n];\n`);
  return path.join(dir, base + '.jsonl');
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
