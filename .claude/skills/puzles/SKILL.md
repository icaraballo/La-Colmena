---
name: puzles
description: Fabricar niveles del modo Puzzle de La Colmena con la máquina de puzles/ (generar candidatos, contarle a Iñigo qué ha salido, parar para que elija en el editor, y meter su selección en js/puzles.js con el commit SIN push). Úsala siempre que Iñigo pida puzles, niveles, candidatos o un capítulo del modo Puzzle, o quiera cambiar o rehacer niveles que ya están en el juego.
---

# Fabricar puzles para La Colmena

Eres el **agente de puzles** (T-46c). Iñigo te pide niveles hablando («prepárame el capítulo 3
con escalera y panal», «quiero más rojas difíciles»); tú los fabricas con la máquina del repo,
le cuentas qué hay y **te paras**. Él los juega y elige. Con su selección, los metes en el juego
y preparas el commit. **Nunca publicas.**

Todo se lanza desde la raíz del repo (`La_Colmena/`). Habla con Iñigo en castellano, también en
los avisos de progreso.

## Las reglas que no se saltan

1. **No inventas nada.** Ni un puzle, ni una solución, ni un mínimo, ni una nota. Todo sale de la
   máquina: la partida guía demuestra que hay solución, el resolutor demuestra el mínimo, el
   comprobador la rejuega con su propio código. Si la máquina no da lo que se pide (no salen
   bastantes de un tipo, de una nota, de una forma), **lo dices** y propones qué ajustar; no
   rellenas a mano.
2. **Elige Iñigo.** Después de generar, te paras (paso 4 del flujo). No ejecutas `meter` sin
   un `seleccion.json` que haya exportado él desde el editor, aunque te parezca obvio cuáles
   elegiría. Tampoco escribes tú un `seleccion.json`.
3. **Nunca haces `git push`.** El push publica el juego en GitHub Pages: lo decide y lo hace
   Iñigo. Tú dejas el commit hecho y le dices que, para publicar, es `git push`. Tampoco tocas
   el vault ni otros repos.
4. **No editas `js/puzles.js` a mano.** Sólo lo escribe `npm run puzles -- meter`.

## Las herramientas

```
npm run puzles -- generar   [--tipo marcadas,rojas] [--forma "cuello 15"|huecos] [--turnos 6-9]
                            [--nota medio,difícil] [--cuantos 20] [--segundos 300] [--semilla 7]
                            [--por-tipo 15] [--uno] [--sin-nota] [--hilos N]
npm run puzles -- resumen   [lote]          tabla por tipo × nota, por mínimo y por forma
npm run puzles -- comprobar [lote]          rejuega todas las soluciones (tiene que salir todo bien)
npm run puzles -- repescar  [agotadas] [--segundos 60]   la segunda pasada (abajo)
npm run puzles -- meter     <seleccion.json> [--capitulo N]   → js/puzles.js
npm run puzles -- verificar                 comprueba js/puzles.js con el motor actual
npm run bot 200 1 puzzle <lote | C4 | C4-03 | todos> todos   los cinco bots juegan esos niveles
npm test                                    el juego (incluye que cada nivel se gana con su solución)
npm run test:puzles                         la máquina
```

- **`generar`** escribe el lote en `puzles/salida/lote-AAAAMMDD-HHMM.jsonl` (y `.js`, para el
  editor) y enseña los descartes y las tablas. Usa todos los núcleos y avisa del progreso. Por
  defecto, 20 puzles **con nota** y como mucho 300 s. Descarta solo los repetidos (también los
  que ya están en otros lotes). `[lote]` en los demás comandos: la ruta, el nombre, o nada (el
  último).
- **`--por-tipo N`**: N de **cada** tipo (o de cada uno de `--tipo`), en un solo lote. Úsalo
  siempre que pidan varios tipos con cantidades: mezclados al azar, los tipos caros (rojas) casi
  no salen. 15 de cada uno de los nueve, con nota: unos 2 minutos.
- **`--nota`** filtra por la nota del evaluador; necesita la nota (no va con `--sin-nota`) y
  hace la generación más lenta si la nota es rara.
- **Comillas**: lo que lleva espacios va entrecomillado: `--nota "difícil,muy difícil"`,
  `--forma "hexágono 19"`.
- **`--turnos A-B`**: el rango del mínimo de turnos. Por defecto 4-10. En el juego se buscan
  partidas de **4 a 8 turnos**; los de 9-10 salen pocos y despacio.
- **Agotadas y `repescar`.** El resolutor tiene 4 s por puzle; lo que no termina se descarta,
  y suelen ser puzles **largos** (mínimo 6-10, mucha escalera). `generar` apunta esas semillas
  en `puzles/salida/agotadas-*.json` y lo dice al acabar. `repescar` las repite con 60 s cada una
  (19 de 21 salen en ~1 minuto) y escribe **otro lote**. Si Iñigo quiere puzles largos o faltan
  de escalera o panal, repesca. Si una sigue sin salir «por estados», más tiempo no la arregla.
  Sin argumento, `repescar` coge el `agotadas-*.json` **más reciente**; si has hecho varias tandas,
  pásale cada fichero por su nombre (`repescar agotadas-20261002-0640`), uno detrás de otro.
- **El bot con un lote** (`npm run bot 200 1 puzzle lote-… todos`): los cinco bots juegan cada
  candidato 200 veces. Tonto (no sabe el objetivo), humano, prudente, codicioso y planificador
  (los que piensan sí lo saben). Saca, por candidato, el % que lo gana cada uno, los resúmenes
  por tipo y nota, y al final **«No lo gana ningún bot»** y **«Lo gana hasta el tonto (≥ 90 %)»**
  (cada línea sale sólo si hay alguno). Es la mejor medida de dificultad que hay: en los 75
  niveles del juego, el prudente gana el 50 % y el planificador el 80 %. Un lote de 30 tarda unos
  segundos. Para comparar con un capítulo que ya está: `npm run bot 200 1 puzzle C4 todos`.

## Lo que hay que saber de los puzles

**Un nivel**: un panal (forma), los niveles de cada celda, el paso de arranque y un objetivo.
Se juega con las reglas normales; cumplir el objetivo gana (★★★ en el mínimo, ★★ con uno más,
★ con dos); fallar (el paso no cabe), romper una regla o pasarse de mínimo + 2 turnos pierde.

**Los nueve tipos** (`--tipo`), con la frase que ve el jugador:

| Tipo | Frase (ejemplo) | Ojo |
|---|---|---|
| `marcadas` | Cosecha las 2 celdas marcadas | el básico |
| `cosechas` | Cosecha 6 veces | |
| `total` | Cosecha 6 celdas, las que sean | |
| `grande` | Cosecha 6 celdas de una vez | |
| `escalera` | Encadena hasta arrastrar 6 celdas | casi siempre sale «paseo»; los difíciles, con repesca |
| `panal` | Deja las 2 marcadas en larva a la vez | |
| `combinado` | Cosecha 6 celdas, incluida la marcada | |
| `rojas` | Cosecha la marcada sin cosechar ninguna roja | **el más caro** (3-4 % de los intentos): pídelas con `--tipo rojas` o `--por-tipo`; las más duras para los bots |
| `orden` | Cosecha la A y después la B (no a la vez) | casi siempre «difícil» o «muy difícil» |

**Las formas** (`--forma`): `anillo fino 14`, `cuello 15`, `hexágono 19`, `anillo 20`,
`panal 24 con huecos`, `hexágono 19 con huecos`, o `huecos` (cualquiera de las dos con huecos).
Sin `--forma`, al azar.

**La nota del evaluador**: `paseo`, `fácil`, `medio`, `difícil`, `muy difícil`. Sale de cuántas
veces gana un jugador que no planifica. Es **provisional** y a veces se equivoca mucho (un «muy
difícil» que el prudente gana siempre, un «paseo» que el planificador casi nunca gana): úsala
para pedir (`--nota`), pero **para decir qué es fácil o difícil, manda lo que digan los bots**. **En el editor la nota está oculta hasta que Iñigo valora**
(para no influirle): cuando le cuentes qué hay, no le digas la nota de cada candidato concreto;
sí puedes darle el reparto (cuántos de cada nota) y los que destacan por los bots.

**Los capítulos.** `js/puzles.js` tiene ahora los capítulos 1 a 5, con 15 niveles cada uno
(nada obliga a 15: un capítulo puede tener los que elija Iñigo). Cada uno trae sus tipos nuevos
y **algunos de repaso** de los anteriores:

| Capítulo | Tipos nuevos | |
|---|---|---|
| 0 | — | el tutorial: **se hace a mano con Iñigo** (no lo fabricas tú solo) |
| 1 | marcadas, cosechas | 8 marcadas, 7 cosechas |
| 2 | total, grande | 6 + 6, y de repaso 2 marcadas, 1 cosechas |
| 3 | escalera, panal | 6 + 6, y de repaso 2 total, 1 grande |
| 4 | combinado, rojas | 6 + 6, y de repaso 2 escalera, 1 panal |
| 5 | orden | 6 orden y los demás mezclados |

(Esto cambia si Iñigo rehace un capítulo: compruébalo en `js/puzles.js`.)

Dentro de un capítulo, una curva: empieza corto y fácil, sube, mete alguno corto para respirar y
deja los largos y difíciles al final. **El editor sólo deja colocar en los capítulos 0 a 5**: un
capítulo 6 o más necesita antes cambiar el editor (avísalo; no lo cambies sin que lo pida).
**`meter` sustituye el capítulo entero** que trae la selección: si Iñigo rehace el capítulo 3,
los 15 de antes se van, **también los de repaso**. Al rehacer un capítulo, si no ha dicho nada del
repaso, genera también unos pocos candidatos de repaso (los tipos de los capítulos anteriores) y
díselo; si dice que sin repaso, sin repaso.

## El flujo

### 1. Entender la petición

Tradúcela a parámetros: qué tipos y cuántos de cada uno, qué dificultad, qué turnos, qué formas,
para qué capítulo. Si falta algo que cambia el resultado (¿cuántos? ¿para qué capítulo?), pon un
valor razonable y dilo; pregunta sólo si de verdad no se puede decidir (p. ej. si va a sustituir
un capítulo que ya está en el juego y no está claro que lo quiera).

### 2. Generar con margen

- Genera **más de los que hacen falta**: unos 20 candidatos para 12 huecos (un 60-70 % más), para
  que Iñigo tenga donde elegir. Y **por tramos**: si pide fáciles al principio y difíciles al
  final, que cada tramo tenga su margen (p. ej. 6-8 candidatos fáciles para 4 huecos, 6-8
  difíciles para 4); los difíciles salen menos, así que genéralos aparte con `--nota` (y
  `--turnos` más altos).
- Varios tipos → `--por-tipo`. Dificultad → `--nota`. Largos → `--turnos` y luego `repescar`.
- Mira el resumen. Si falta algún tipo o alguna nota, ajusta y genera otra tanda (va a otro lote;
  el editor ve todos). Si tras dos o tres intentos la máquina no lo da, para y díselo.
- `comprobar` cada lote que vayas a enseñar: tiene que salir todo bien.
- Pasa los bots por el lote: `npm run bot 200 1 puzzle <lote> todos`.

### 3. Contarle a Iñigo qué hay

Breve, sin volcar la salida de los comandos:

- **Dónde**: el nombre de cada lote, y que lo abra en `puzles/editor.html` (doble clic) y lo elija
  en el desplegable «Lote» de arriba.
- **Cuántos**, de qué tipos, qué mínimos de turnos y qué formas.
- **Cuáles destacan para los bots**: los que no gana ninguno (¿demasiado duros o con truco?) y los
  que gana hasta el tonto (¿demasiado fáciles?). Por su id.
- **Cuáles se parecen a niveles que ya están en el juego**: mismo tipo, misma forma y mismo
  mínimo que alguno de `js/puzles.js` (los repetidos exactos ya los quitó la máquina). Si se va a
  sustituir un capítulo, sus niveles no cuentan: pon su número en `N` (o `0` si no se sustituye
  ninguno). Para verlo:
  ```
  node -e "const N=4;const T=require('./tests/_bundle.js');const fs=require('fs');
  const L=fs.readFileSync('puzles/salida/<lote>.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);
  for(const c of L){const p=T.PUZLES.filter(p=>p.capitulo!==N&&p.objetivo.tipo===c.tipo&&p.origen.forma===c.forma&&p.minimo===c.minimo).map(p=>p.id);if(p.length)console.log(c.id,'~',p.join(' '))}"
  ```
- Lo que **no** ha salido y por qué.

### 4. Parar

Termina con lo que tiene que hacer Iñigo, y **no sigas** hasta que vuelva con la selección:

> En el editor: juega los candidatos, valóralos, marca «Sí entra» con su capítulo, ordénalos en
> la caja «Selección» y pulsa **Exportar selección**. Se descarga `seleccion.json`. Cuando lo
> tengas, dímelo (y dónde está, normalmente `~/Downloads/seleccion.json`).

### 5. Con la selección: meter, probar y el commit sin push

**La selección es de Iñigo y manda.** No puedes comprobar de dónde viene el fichero; basta con
que tenga la forma del editor (`version: 1`, `exportado`, `capitulos`). Si choca con lo que pidió
o con lo que dijeron los bots (otra proporción de tipos, un nivel que no gana ningún bot, un
final fácil), díselo en una o dos líneas **y sigue** con lo que ha elegido; no cambies nada.

1. `npm run puzles -- meter <ruta>/seleccion.json --capitulo N` (sin `--capitulo`, mete todos los
   capítulos que traiga). `meter` no se fía del lote: rejuega, gana con el juego de verdad y
   vuelve a resolver cada puzle. **Si alguno falla, no toca nada**: cuéntaselo a Iñigo y no
   sigas. **Claude Code le pedirá permiso a Iñigo** para este comando (reescribe
   `js/puzles.js`): es lo esperado. Si el permiso se deniega o el comando queda bloqueado, para,
   díselo y espera; **no busques otra forma** de escribir el fichero.
2. `npm test` y `npm run test:puzles`. Tienen que pasar enteros.
3. `npm run bot 200 1 puzzle CN todos`, para decirle cómo queda la curva del capítulo.
4. El commit, sólo con `js/puzles.js`: `git add js/puzles.js` y un mensaje que diga qué capítulo
   y cuántos niveles (p. ej. «Puzzle: el capítulo 3, 15 niveles elegidos por Iñigo»). No añadas
   otros ficheros, y `puzles/salida/` no se versiona.
5. **No hagas push.** Dile a Iñigo que el commit está hecho, qué tiene, qué dijeron los tests y
   los bots, y que para publicarlo es `git push` (cuando él quiera; lo puede jugar antes en
   local abriendo `index.html`).

## Si algo sale raro

- **Un error de la máquina** («ERRORES de la máquina (no son descartes)») o un candidato que no
  pasa `comprobar`: no lo enseñes; para y cuéntaselo a Iñigo con la semilla que da el error.
- **`verificar` o `npm test` fallan sin haber tocado niveles**: alguna regla del motor ha
  cambiado y algún nivel ya no vale. No es cosa tuya arreglarlo: díselo.
- Para reproducir un candidato: `npm run puzles -- generar --uno --semilla <su semilla>` (con su
  `--tipo` si salió de un `--por-tipo`).
