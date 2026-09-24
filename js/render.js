// Dibujo del panal. Esta es la única capa que conoce el canvas, y la única que
// cambia cuando se toque la estética. El motor no se entera.
//
// Hexágonos pointy-top en falso 2.5D: cada nivel desplaza la celda LIFT px hacia
// arriba y se dibuja el lateral del prisma debajo, de forma que la escalera se
// lee de un vistazo.
const LIFT = 9;

// Rampa de luminosidad 1→4 y un ámbar saturado en el 5 (DESIGN §2). La
// información va en el brillo, no en el tono: se juzga "¿están a la misma
// altura?" a toda velocidad y aguanta el daltonismo. El 5 salta a la vista a
// propósito: es la jugada que quieres ver.
// El 0 (agua) sale de la rampa ámbar a propósito: no es "un nivel más oscuro",
// es otra cosa, y tiene que leerse como jugable de un vistazo.
const LEVEL_COLORS = ['#2E4756', '#6E5A32', '#9C7F3C', '#C8A14A', '#E3C87E', '#F79A1F'];

// El símbolo de cada ítem vive en ITEM_INFO (constants.js), junto al nombre y
// lo que hace, para que la gota y la leyenda del HUD no puedan discrepar.

const layout = { cx: [], cy: [], R: 0, w: 0 };

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

// Calcula el centro de cada celda para el tamaño actual del canvas.
function computeLayout(width, height) {
  const R = Math.min(width / (6 * Math.sqrt(3) + 1), height / 10.5);
  const w = Math.sqrt(3) * R;
  layout.R = R; layout.w = w;
  layout.cx.length = 0; layout.cy.length = 0;

  const totalH = 1.5 * R * (ROW_WIDTHS.length - 1) + 2 * R;
  // En pantalla vertical (el móvil) el panal no va centrado sino algo más arriba:
  // centrado quedaba bajo, lejos del HUD, con un hueco grande encima (playtest de
  // la v8). En horizontal (el PC), centrado como siempre.
  const arriba = height > width * 1.1 ? 0.3 : 0.5;
  const top = (height - totalH) * arriba + R + MAX_LEVEL * LIFT * 0.5;

  ROW_WIDTHS.forEach((n, r) => {
    const rowW = n * w;
    for (let c = 0; c < n; c++) {
      layout.cx.push((width - rowW) / 2 + w / 2 + c * w);
      layout.cy.push(top + r * 1.5 * R);
    }
  });
}

// Altura en píxeles a la que se dibuja la cara de arriba de una celda.
function topY(s, i) {
  const h = s.height[i];
  return layout.cy[i] - Math.max(0, h - 1) * LIFT;
}

function hexPath(ctx, x, y, R) {
  const w = Math.sqrt(3) * R;
  ctx.beginPath();
  ctx.moveTo(x, y - R);
  ctx.lineTo(x + w / 2, y - R / 2);
  ctx.lineTo(x + w / 2, y + R / 2);
  ctx.lineTo(x, y + R);
  ctx.lineTo(x - w / 2, y + R / 2);
  ctx.lineTo(x - w / 2, y - R / 2);
  ctx.closePath();
}

// El lateral del prisma: el contorno inferior del hexágono, extruido D px.
function sidePath(ctx, x, y, R, D) {
  const w = Math.sqrt(3) * R;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + R / 2);
  ctx.lineTo(x, y + R);
  ctx.lineTo(x + w / 2, y + R / 2);
  ctx.lineTo(x + w / 2, y + R / 2 + D);
  ctx.lineTo(x, y + R + D);
  ctx.lineTo(x - w / 2, y + R / 2 + D);
  ctx.closePath();
}

// ui = { cells, ready, fuera, abejas, destellos }
//   ready   la cadena ya es una jugada válida
//   fuera   el dedo está fuera del panal: soltar cancela
//   abejas  partículas de la cosecha: { x, y, t0 } — las lleva app.js
function draw(ctx, s, ui, now) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const R = layout.R;
  const inChain = new Set(ui.cells);
  const capullos = new Set(s.desastres.filter(d => d.tipo === 'capullo').map(d => d.tile));

  // Orden por índice = de arriba abajo, que es el que hace solapar bien el 2.5D.
  for (let i = 0; i < TILE_COUNT; i++) {
    // Celda rota: no existe. Ni hexágono ni borde. El panal encoge de verdad y se
    // ve que encoge.
    if (s.roto[i]) continue;

    const x = layout.cx[i];
    const h = s.height[i];
    const D = Math.max(0, h - 1) * LIFT;   // el agua se dibuja a ras, sin prisma
    const y = layout.cy[i] - D;
    const color = LEVEL_COLORS[h];

    if (D > 0) {
      ctx.fillStyle = shade(color, 0.55);
      sidePath(ctx, x, y, R, D);
      ctx.fill();
    }

    ctx.fillStyle = color;
    hexPath(ctx, x, y, R);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = h >= LARVA ? 'rgba(30,20,5,0.7)' : 'rgba(255,245,225,0.8)';
    ctx.font = `600 ${Math.round(R * 0.55)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(h), x, y);

    // Seda: la celda está bloqueada unos turnos.
    if (s.sedaHasta[i] > s.turn) {
      ctx.save();
      hexPath(ctx, x, y, R);
      ctx.clip();
      ctx.strokeStyle = 'rgba(245,245,245,0.75)';
      ctx.lineWidth = 1.5;
      for (let k = -2 * R; k < 2 * R; k += R / 3) {
        ctx.beginPath();
        ctx.moveTo(x + k, y - R); ctx.lineTo(x + k + R, y + R);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Capullo de polilla: aviso, eclosiona en el siguiente fallo.
    if (capullos.has(i)) {
      ctx.beginPath();
      ctx.ellipse(x + R * 0.42, y - R * 0.38, R * 0.17, R * 0.26, 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#d8d2c4';
      ctx.fill();
      ctx.strokeStyle = '#6b6254';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // La cadena: un contorno grueso, «la negrita del borde» (v7). No se oscurece
  // la celda porque en este juego el brillo ES el nivel: una larva oscurecida
  // se leería como un huevo justo cuando el jugador decide qué está a la misma
  // altura. Blanco a medio grosor mientras está incompleta, grueso cuando está
  // lista, con un halo oscuro debajo para que se vea también sobre la
  // operculada, que es crema. Hacia dentro del hexágono, para no pisar a las
  // vecinas, y en una pasada aparte para que ninguna celda lo tape.
  // Con el dedo fuera del panal se apaga: soltar ahí cancela.
  if (inChain.size) {
    const blanco = ui.ready ? R * 0.16 : R * 0.09;
    const halo = blanco + R * 0.08;
    ctx.save();
    ctx.globalAlpha = ui.fuera ? 0.3 : 1;
    ctx.lineJoin = 'round';
    for (const i of inChain) {
      if (s.roto[i]) continue;
      const x = layout.cx[i], y = topY(s, i);
      hexPath(ctx, x, y, R - halo / 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = halo;
      ctx.stroke();
      hexPath(ctx, x, y, R - halo / 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = blanco;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Destellos: lo que acaba de pasar, marcado sobre las celdas afectadas durante
  // un segundo. Hasta la v4 la varroa, la velutina y la helada sólo existían en
  // una línea de texto del HUD, así que un cambio en el tablero no tenía causa
  // visible (T-16).
  for (const d of (ui.destellos || [])) {
    const k = Math.min(1, ((now || 0) - d.t0) / 900);
    if (k < 0 || k >= 1) continue;
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3 * (1 - k) + 1;
    for (const i of d.tiles) {
      if (layout.cx[i] === undefined) continue;
      hexPath(ctx, layout.cx[i], topY(s, i), R * (1 + 0.25 * k));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ítem: gota de néctar sobre su celda. Parpadea en su último turno: si no lo
  // coges ahora, se evapora (v5).
  if (s.item) {
    const x = layout.cx[s.item.tile];
    const y = topY(s, s.item.tile) - R * 0.1;
    const ultimo = (s.item.caduca - s.turn) <= 1;
    const pulso = 1 + (ultimo ? 0.20 : 0.08) * Math.sin((now || 0) / (ultimo ? 90 : 180));
    ctx.beginPath();
    ctx.arc(x, y, R * 0.36 * pulso, 0, Math.PI * 2);
    ctx.fillStyle = s.item.tipo === ITEMS.REINA ? '#b04ad8' : (ultimo ? '#ff9f45' : '#ffd23f');
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = s.item.tipo === ITEMS.REINA ? '#fff' : '#3a2a00';
    ctx.font = `700 ${Math.round(R * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((ITEM_INFO[s.item.tipo] || {}).simbolo || '?', x, y + 1);
  }

  // El recorrido del dedo ya no se dibuja (v7): el contorno dice qué está
  // elegido, y la línea tapaba los números. drag.trail se sigue usando en
  // input.js para saber dónde está el dedo y para deshacer.

  // Cosecha: la abeja sale volando.
  for (const a of ui.abejas) {
    const t = ((now || 0) - a.t0) / 900;
    if (t < 0 || t > 1) continue;
    const x = a.x + Math.sin(t * 9 + a.x) * R * 0.25;
    const y = a.y - t * R * 3.5;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#F79A1F';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(x - R * 0.12, y - R * 0.12, R * 0.12, R * 0.07, -0.6, 0, Math.PI * 2);
    ctx.ellipse(x + R * 0.12, y - R * 0.12, R * 0.12, R * 0.07, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Qué celda hay bajo un punto. Por distancia al centro, no por polígono exacto:
// en un móvil los hexágonos son pequeños y el dedo es gordo. Las celdas rotas no
// cuentan (no existen); el agua sí, es jugable.
function tileAt(s, px, py) {
  let best = -1, bestD = layout.R * 0.95;
  for (let i = 0; i < TILE_COUNT; i++) {
    if (s.roto[i]) continue;
    const d = Math.hypot(px - layout.cx[i], py - topY(s, i));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
