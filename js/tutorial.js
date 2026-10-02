// El tutorial, «Aprende a jugar» (v11.2, T-49; LC-Tutorial). Ocho niveles cortos, una
// idea cada uno. Por dentro es el capítulo 0 de Puzzle: los mismos campos que un nivel
// de js/puzles.js y las reglas de siempre. Por fuera no es Puzzle: no sale en el mapa,
// no da estrellas y no tiene límite de turnos (`limite: null`). Va aparte de
// js/puzles.js para que ni el mapa ni los bots lo vean y `meter` no lo pise.
//
// Hecho a mano con Iñigo el 02-10, no por la máquina; pero pasa por lo mismo que los
// niveles de verdad: `npm test` y `npm run puzles -- verificar` comprueban que cada uno
// se gana con su solución, que el resolutor no encuentra nada más corto y que el
// comprobador la rejuega.
//
// Los campos del tutorial, aparte de los de un nivel (LC-DESIGN §23):
//   titulo      el nombre del nivel en la tarjeta («1 · Arrastra»)
//   consejo     la frase de la tarjeta; en el nivel 3, una por fase
//   guia        'siempre' (la guía se ve sola) o 'pista' (sólo con el botón Pista)
//   aprendido   la frase de «¡Bien!»
//   late        'paso' o 'max': el recuadro que late en ese nivel
//   recuadro    un texto fijo debajo del panal (nivel 3)
//   cancelar    hay que cancelar una vez (soltar fuera) antes de poder jugar (nivel 3)
//   explicaMax  al ganar se enseña el grupo de máx, como en un fallo (nivel 7)
//   falloExtra  la segunda frase de la tarjeta de fallo, si no es la de siempre
//
// Los textos no llevan números de regla a mano (regla 8): {2} se escribe «huevo (2)» y
// {5s}, «abejas (5)», con NOMBRE_NIVEL; {paso} y {max} salen del evento del fallo.
const TUTORIAL_VERSION = 1;
const TUTORIAL = [
  {"id":"C0-01","orden":1,"titulo":"Arrastra","tablero":"hex37","rotas":[0,1,2,3,4,5,6,7,8,9,10,13,14,15,16,20,21,22,23,26,27,28,29,30,31,32,33,34,35,36],"height":[0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2,2,2,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],"paso":3,"objetivo":{"tipo":"panal","celdas":[17,18,19],"nivel":3},"minimo":1,"limite":null,"solucion":[[17,18,19]],
   "guia":"siempre",
   "consejo":"Pasa el dedo por las <b>tres celdas de {2}</b>. Juntas y al mismo nivel, <b>suben uno</b>.",
   "aprendido":"Arrastrar por celdas juntas y al mismo nivel las sube un nivel."},
  {"id":"C0-02","orden":2,"titulo":"Sólo el mismo nivel","tablero":"hex37","rotas":[0,1,2,3,4,7,8,9,14,15,21,22,23,26,27,28,29,30,31,32,33,34,35,36],"height":[0,0,0,0,0,1,2,0,0,0,2,1,2,3,0,0,3,2,2,1,3,0,0,0,2,3,0,0,0,0,0,0,0,0,0,0,0],"paso":3,"objetivo":{"tipo":"panal","celdas":[17,18,24],"nivel":3},"minimo":1,"limite":null,"solucion":[[17,24,18]],
   "guia":"siempre",
   "consejo":"No se pueden <b>mezclar niveles</b>. Busca las tres celdas de {2} que están juntas.",
   "aprendido":"Un arrastre sólo junta celdas del mismo nivel."},
  {"id":"C0-03","orden":3,"titulo":"Si te equivocas","tablero":"hex37","rotas":[0,1,2,3,4,5,6,7,8,9,10,13,14,15,16,20,21,22,23,26,27,28,29,30,31,32,33,34,35,36],"height":[0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,2,2,1,0,0,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0],"paso":3,"objetivo":{"tipo":"panal","celdas":[17,18,24],"nivel":3},"minimo":1,"limite":null,"solucion":[[17,24,18]],
   "guia":"siempre","cancelar":true,
   "consejo":["¿Has empezado mal? <b>Saca el dedo fuera del panal</b> y suelta: la jugada no cuenta y no gastas turno.",
              "Ahora sí: sube las tres marcadas."],
   "recuadro":"<b>Con la cadena completa</b>, volver atrás por el mismo camino quita la última celda. Y si sueltas antes de llegar al paso, tampoco cuenta.",
   "aprendido":"Soltar fuera del panal cancela la jugada. No gastas turno."},
  {"id":"C0-04","orden":4,"titulo":"El paso crece","tablero":"hex37","rotas":[0,1,2,3,4,5,6,7,8,9,10,13,14,15,16,20,21,22,23,26,27,28,29,30,31,32,33,34,35,36],"height":[0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],"paso":1,"objetivo":{"tipo":"escalera","n":4},"minimo":4,"limite":null,"solucion":[[11],[12,18],[11,18,12],[17,24,25,19]],
   "guia":"siempre","late":"paso",
   "consejo":"Cada turno, el <b>paso</b> pide <b>una celda más</b>: 1, 2, 3, 4. Míralo arriba.",
   "aprendido":"Cada turno hay que arrastrar exactamente una celda más que el anterior."},
  {"id":"C0-05","orden":5,"titulo":"Cosecha","tablero":"hex37","rotas":[0,1,2,3,4,5,6,7,8,9,10,13,14,15,16,20,21,22,23,26,27,28,29,30,31,32,33,34,35,36],"height":[0,0,0,0,0,0,0,0,0,0,0,1,3,0,0,0,0,2,5,5,0,0,0,0,4,3,0,0,0,0,0,0,0,0,0,0,0],"paso":2,"objetivo":{"tipo":"marcadas","celdas":[18]},"minimo":1,"limite":null,"solucion":[[18,19]],
   "guia":"siempre",
   "consejo":"Las dos <b>{5s}</b> están listas. Arrástralas para <b>cosecharlas</b>: salen volando y la celda vuelve a <b>{0}</b>.",
   "aprendido":"Cosechar es arrastrar abejas, como cualquier otro arrastre: también cuenta el paso. La celda vuelve a {0} y empieza otra vez."},
  {"id":"C0-06","orden":6,"titulo":"Vuelve sobre tus pasos","tablero":"hex37","rotas":[0,1,2,3,4,5,6,7,8,9,10,13,14,15,16,20,21,22,23,26,27,28,29,30,31,32,33,34,35,36],"height":[0,0,0,0,0,0,0,0,0,0,0,3,1,0,0,0,0,1,3,3,0,0,0,0,3,1,0,0,0,0,0,0,0,0,0,0,0],"paso":4,"objetivo":{"tipo":"panal","celdas":[11,18,19,24],"nivel":4},"minimo":1,"limite":null,"solucion":[[11,18,24,19]],
   "guia":"pista",
   "consejo":"Para llegar a otra rama, <b>vuelve a pasar</b> por una celda ya elegida. No cuenta dos veces.",
   "aprendido":"El dedo puede volver a pasar por una celda ya elegida."},
  {"id":"C0-07","orden":7,"titulo":"Máx y el fallo","tablero":"hex37","rotas":[0,1,2,3,4,5,6,7,8,9,10,13,14,15,16,20,21,22,23,26,27,28,29,30,31,32,33,34,35,36],"height":[0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1,1,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0],"paso":3,"objetivo":{"tipo":"escalera","n":5},"minimo":3,"limite":null,"solucion":[[11,17,12],[18,25,24,19],[11,18,19,17,12]],
   "guia":"pista","late":"max","explicaMax":true,
   "consejo":"<b>Máx</b> es tu grupo más grande de celdas juntas y al mismo nivel. Si queda <b>por debajo del paso, fallas</b>. Deja sitio para la siguiente.",
   "aprendido":"Mira el panal: ahora el paso pediría <b>{paso}</b> y tu grupo más grande es de <b>{max}</b>. Si siguieras, fallarías. Antes de arrastrar, piensa en la jugada siguiente.",
   "falloExtra":"Las celdas que no subes tienen que quedar <b>juntas</b> para la jugada siguiente."},
  {"id":"C0-08","orden":8,"titulo":"Todo junto","tablero":"hex37","rotas":[0,1,2,3,4,8,9,14,15,21,22,27,28,32,33,34,35,36],"height":[0,0,0,0,0,2,3,3,0,0,3,3,4,4,0,0,0,1,4,4,3,0,0,3,3,1,2,0,0,1,2,4,0,0,0,0,0],"paso":1,"objetivo":{"tipo":"marcadas","celdas":[24]},"minimo":4,"limite":null,"solucion":[[12],[23,24],[18,24,19],[12,19,18,24]],
   "guia":"pista",
   "consejo":"Ya lo sabes todo. Cosecha la marcada: <b>piensa antes de arrastrar</b>.",
   "aprendido":null},
];
