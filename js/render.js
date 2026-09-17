// Dibujo del tablero. Esta es la única capa que conoce el canvas, y es la única
// que habrá que reescribir cuando el juego tenga tema. El motor no se entera.

// Hexágonos pointy-top (punta arriba) en falso 2.5D: cada nivel de altura
// desplaza la casilla LIFT px hacia arriba y se dibuja el lateral del prisma
// debajo, de forma que la topografía se lee de un vistazo.
const LIFT = 9;

// Escala de color por altura. Deliberadamente abstracta: no es agua/arena/
// hierba, es una rampa de frío a cálido. El nivel máximo rompe la rampa con un
// naranja fuerte porque no es "una altura más", es una jugada distinta.
const LEVEL_COLORS = {
  1: '#2c5f7c',
  2: '#3d8ea8',
  3: '#57b0a4',
  4: '#8cc97f',
  5: '#dcc25c',
  6: '#e8743f',
};

const layout = { cx: [], cy: [], R: 0, w: 0 };

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

// Calcula el centro de cada casilla para el tamaño actual del canvas.
function computeLayout(width, height) {
  // La fila más ancha tiene 6 casillas y hay 5 filas. Se reserva margen arriba
  // para que las casillas altas no se salgan por el techo.
  const R = Math.min(width / (6 * Math.sqrt(3) + 1), height / 10.5);
  const w = Math.sqrt(3) * R;
  layout.R = R; layout.w = w;
  layout.cx.length = 0; layout.cy.length = 0;

  const totalH = 1.5 * R * (ROW_WIDTHS.length - 1) + 2 * R;
  const top = (height - totalH) / 2 + R + MAX_LEVEL * LIFT * 0.5;

  ROW_WIDTHS.forEach((n, r) => {
    const rowW = n * w;
    for (let c = 0; c < n; c++) {
      layout.cx.push((width - rowW) / 2 + w / 2 + c * w);
      layout.cy.push(top + r * 1.5 * R);
    }
  });
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

// ui = { path: [...], ready: bool }  — ready cuando la cadena mide ya el paso exigido.
function draw(ctx, s, ui) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const R = layout.R;
  const inPath = new Set(ui.path);

  // Orden por índice = de la fila de arriba a la de abajo, que es el orden
  // correcto para que el 2.5D se solape bien.
  for (let i = 0; i < TILE_COUNT; i++) {
    const x = layout.cx[i];
    const base = layout.cy[i];

    if (!s.alive[i]) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      hexPath(ctx, x, base, R * 0.92);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    const h = s.height[i];
    const D = (h - 1) * LIFT;
    const y = base - D;
    const color = LEVEL_COLORS[h] || '#555';

    if (D > 0) {
      ctx.fillStyle = shade(color, 0.55);
      sidePath(ctx, x, y, R, D);
      ctx.fill();
    }

    ctx.fillStyle = color;
    hexPath(ctx, x, y, R);
    ctx.fill();

    if (inPath.has(i)) {
      ctx.strokeStyle = ui.ready ? '#ffffff' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = ui.ready ? 4 : 2.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = h >= 5 ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${Math.round(R * 0.7)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(h), x, y);
  }

  // La cadena en curso, dibujada como línea sobre las casillas.
  if (ui.path.length > 1) {
    ctx.beginPath();
    ui.path.forEach((i, k) => {
      const x = layout.cx[i];
      const y = layout.cy[i] - (s.height[i] - 1) * LIFT;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = ui.ready ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = Math.max(3, R * 0.14);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// Qué casilla hay bajo un punto. Por distancia al centro, no por polígono
// exacto: en un móvil los hexágonos son pequeños y el dedo es gordo.
function tileAt(s, px, py) {
  let best = -1, bestD = layout.R * 0.95;
  for (let i = 0; i < TILE_COUNT; i++) {
    if (!s.alive[i]) continue;
    const dx = px - layout.cx[i];
    const dy = py - (layout.cy[i] - (s.height[i] - 1) * LIFT);
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
