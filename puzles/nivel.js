// La máquina de puzles (T-46) · el estado del motor para un nivel.
//
// Lo usan la máquina (motor.js, en Node) y el editor (editor.html, como script
// clásico), así que no pide el motor por su cuenta: recibe lo que necesita.
//
// El tablero, la forma, los niveles y el paso los pone el nivel. Se juega en modo
// Panal libre (sin reloj, sin helada, sin plagas) y con los ítems apagados: con
// `itemCalma` infinito, spawnItemIfEarned no saca ninguno. En el juego (F3) esto
// será `crearPuzle(nivel)` del motor, con una bandera; aquí basta, porque este
// estado nunca se guarda.
function crearEstadoPuzle(motor, { tablero = 'panal24', height, rotas = [], paso = 1 }) {
  const t = motor.TABLEROS[tablero];
  if (!t) throw new Error(`tablero desconocido: ${tablero}`);
  if (height.length !== t.n) throw new Error(`el tablero ${tablero} tiene ${t.n} celdas, no ${height.length}`);
  const s = motor.createState(motor.MODOS.LIBRE, 'normal', 1);
  s.tablero = tablero;
  s.height = Uint8Array.from(height);
  s.roto = new Uint8Array(t.n);
  for (const i of rotas) { s.roto[i] = 1; s.height[i] = motor.AGUA; }
  s.cerrada = new Uint8Array(t.n);
  s.sedaHasta = new Int32Array(t.n);
  s.item = null;
  s.itemCalma = Infinity;
  s.step = paso;
  return s;
}

if (typeof module !== 'undefined') module.exports = { crearEstadoPuzle };
