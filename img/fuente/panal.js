// Un panal en SVG con la rampa del juego (LEVEL_COLORS) y el falso 2.5D: cara de
// arriba del color del nivel y un canto debajo, más oscuro, más alto cuanto más nivel.
const COL = ['#2E4756', '#6E5A32', '#9C7F3C', '#C8A14A', '#E3C87E', '#F79A1F'];
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function panal({ filas, niveles, R, cx, cy, numeros = false }) {
  const w = Math.sqrt(3) * R, dy = 1.5 * R, celdas = [];
  let k = 0;
  filas.forEach((n, f) => {
    const y = cy + (f - (filas.length - 1) / 2) * dy;
    for (let i = 0; i < n; i++) celdas.push({ x: cx + (i - (n - 1) / 2) * w, y, h: niveles[k++] });
  });
  const hex = (x, y, r) => Array.from({ length: 6 }, (_, j) => { const a = Math.PI / 180 * (60 * j - 90); return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  let out = '';
  for (const c of celdas) {
    const alto = R * (0.10 + 0.05 * c.h), r = R * 0.97, top = COL[c.h];
    out += `<polygon points="${hex(c.x, c.y + alto, r)}" fill="${shade(top, 0.55)}"/>`;
    out += `<polygon points="${hex(c.x, c.y, r)}" fill="${top}" stroke="${shade(top, 0.8)}" stroke-width="${(R * 0.03).toFixed(1)}"/>`;
    if (numeros) out += `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="${R * 0.45}" font-weight="700" fill="${c.h >= 3 ? '#4a3a1a' : '#ede4d3'}" opacity=".85">${c.h}</text>`;
  }
  return out;
}
