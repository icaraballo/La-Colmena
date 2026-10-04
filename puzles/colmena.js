// La máquina de puzles (T-46) · las reglas de La Colmena en la forma que entiende
// el buscador. Desde la v11.10 (T-54) el código está en juego.js, que también carga
// el juego para la pista de Puzzle; esto lo prepara con el motor de Node.
const { M } = require('./motor.js');
const { juegoDeNivel, jugadas, OBJ } = require('./juego.js').crearJuego(M);

module.exports = { juegoDeNivel, jugadas, OBJ };
