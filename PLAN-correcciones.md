# Plan de correcciones — «Mi Diario»

> Plan derivado de la Auditoría Técnica (16 jun 2026). 22 hallazgos originales
> consolidados en **18 unidades de trabajo** (15 prompts individuales + 3
> fusionados: M1 = prompts 2+3+22, M2 = 4+5, M3 = 13+20).

---

## ⚙️ Cómo usar este archivo (instrucciones para la IA y para mí)

**Regla de oro: un paso a la vez, revisando entre cada uno.** No ejecutar los 18
prompts de corrido.

Flujo recomendado por cada paso:

1. **Ejecutar SOLO el siguiente prompt pendiente** (el primero sin marcar `[x]`).
2. La IA debe **mostrar el diff** y esperar mi aprobación antes de avanzar.
3. **Verificar** que la app sigue abriendo / que el cambio hace lo que dice.
4. Si está bien: **hacer commit** de ese paso (red de seguridad con git).
5. Marcar el paso como hecho (`[x]`) y pasar al siguiente.

Frase que puedo pegarle a la IA para arrancar:

> «Lee `PLAN-correcciones.md`. Ejecuta **solo el primer prompt pendiente**,
> muéstrame el diff y espera mi aprobación antes de pasar al siguiente. No
> avances de prompt sin que yo lo confirme.»

**Notas de orden / dependencias** (ya reflejadas en la secuencia):
- M1 va **antes** del Paso 2 (el Diario reusa el motor de fusión).
- M3 (Paso 3) depende del Paso 2 (Diario ya integrado).
- Paso 8 (`enablePersistence` vivo) va **después** del Paso 7 (que borra el muerto).
- Paso 10 (CSP) refuerza el Paso 9 (escape XSS): hacer 9 antes.
- M2 (Paso 4) antes del Paso 5 (recordatorio de Inglés en SW).
- La Fase 5 son tareas independientes entre sí; orden flexible.

---

## Fase 1 — Integridad de datos (crítico)

### [x] Paso 1 — M1: Motor de fusión (sellos por elemento + tombstones + anti-churn)
*(fusiona los prompts 2, 3 y 22)*

```
En este proyecto («Mi Diario», PWA), reescribe el motor de fusión de
sincronización para garantizar integridad de datos. Resuelve juntos estos tres
problemas porque comparten archivos (shared/merge.js, shared/sync.js) y modelo
de datos:

(a) Sin sello por elemento: mergeById (shared/merge.js:20) desempata por
item.updatedAt, pero tareas/objetivos no tienen updatedAt por elemento (solo
state.updatedAt global, ver To-do/index.html:1601). Todos valen 0, hay empate y
la regla actual es «gana remoto»; un completado offline se revierte al
reconectar (handleSnapshot, shared/sync.js:87/109) y needsPush queda false, así
que la reversión es permanente.

(b) Sin tombstones: las cuatro estrategias (mergeById :20, dedupeBy :42,
mergeDateMapArrays :59, mergeDateMapBoolArr :77) hacen unión conservadora sin
marcas de borrado; los borrados «resucitan», en Movilidad no se puede desmarcar
un vídeo y en Inglés el OR por posición impide desmarcar un bloque entre
dispositivos.

(c) Churn de sync: en handleSnapshot (shared/sync.js:109), needsPush compara
mergedStr con JSON.stringify(remoteVal); si el orden de claves difiere, hay
reescrituras de ida y vuelta innecesarias.

Tarea:
1. Añade updatedAt POR tarea y POR objetivo y séllalo (Date.now()) en cada
   crear/editar/toggle (busca todos los save/toggle en To-do/index.html, ~1601).
   Compatibilidad con datos antiguos (trátalos como 0 o migra al primer save).
2. Úsalo en mergeById con regla de empate determinista (gana el más reciente;
   ante empate real conserva el cambio local pendiente de push, NO «siempre
   remoto»). Asegura que needsPush quede true cuando el merge difiera del remoto.
3. Introduce tombstones por elemento/fecha con su propio updatedAt; modifica las
   cuatro estrategias para respetar el borrado/desmarcado cuando el tombstone sea
   más reciente que la última edición, y la reaparición en caso contrario. Cubre:
   borrado de tareas/objetivos/sesiones, desmarcar vídeo en Movilidad y desmarcar
   bloque en Inglés (sustituye el OR por posición). Define purga/caducidad de
   tombstones.
4. Normaliza la serialización antes de comparar en handleSnapshot
   (shared/sync.js:109): serializa ambos lados con orden de claves canónico
   (stringify con claves ordenadas recursivamente).
5. Tests (Vitest, estilo test/merge.test.js): completado offline gana sobre
   remoto viejo y marca needsPush; borrar en A queda borrado tras fusionar con B;
   desmarcar se propaga en Movilidad e Inglés; igualdad con distinto orden de
   claves NO genera push.

Nota: la fusión específica del Diario se hace en una tarea aparte que REUSARÁ
estos mecanismos (tie-break + tombstones); aquí solo el motor genérico y
tareas/objetivos/Movilidad/Inglés.

Antes de editar, lee las cuatro funciones de shared/merge.js, handleSnapshot en
shared/sync.js, el modelo de tareas/objetivos en To-do/index.html y cómo guardan
Movilidad (vídeos) e Inglés (bloques por posición). Muéstrame el diseño de
tombstone, la regla de empate y el diff antes de terminar.
```

### [x] Paso 2 — Prompt 1: El Diario no se sincroniza ni se fusiona
*(usar después de M1; reusa su tie-break/tombstones)*

```
En este proyecto («Mi Diario», PWA con sincronización centralizada en el hub),
la pestaña Diario guarda en la clave de localStorage «diario-reflexion-v1»,
pero esa clave NO está incluida en DiarioSync.KEYS ni tiene una estrategia en
STRATEGIES, así que nunca se sube ni se baja de Firestore. El Diario sí aparece
en KEY_TO_SECTION, en SECTION_KEYS.diario (respaldo) y en la UI, pero no se
sincroniza. Resultado: las reflexiones/estados de ánimo escritos en un
dispositivo no llegan a otro y se pierden al reinstalar o cambiar de móvil.

Tarea:
1. Añade «diario-reflexion-v1» a DiarioSync.KEYS en shared/sync.js (~línea 30).
2. Crea una estrategia de fusión por fecha para esa clave en STRATEGIES de
   shared/merge.js (~línea 98): unión de entradas por día; ante conflicto en un
   mismo día, gana la de updatedAt mayor y, si no hay updatedAt, la entrada de
   texto más largo. No debe perder entradas existentes en ningún lado.
3. Revisa index.html:588 y alrededores para confirmar que el Diario entra en el
   mismo flujo de push/pull que las otras secciones.
4. Aplica el mismo criterio a «hub-logros-v1» si procede (o documenta que se
   recalcula y no necesita sync).
5. Actualiza README.md (~línea 20), que aún habla de «las cuatro secciones»:
   ahora son 5.

Antes de tocar nada, lee shared/sync.js, shared/merge.js (sobre todo KEYS,
STRATEGIES y las funciones mergeById/mergeDateMapArrays existentes) y la parte
del Diario en index.html, para reutilizar el patrón ya usado por las otras
secciones. Añade un test en test/merge.test.js que cubra la fusión del Diario
(dos dispositivos con entradas distintas y con conflicto en el mismo día).
No cambies el formato de los datos ya guardados. Muéstrame el diff antes de
darlo por terminado.
```

### [x] Paso 3 — M3: Higiene de respaldo tras el Diario
*(fusiona los prompts 13 y 20; depende del Paso 2)*

```
En este proyecto («Mi Diario», PWA), corrige dos descuidos de respaldo derivados
de haber añadido el Diario como 5ª sección, ambos en la zona de respaldo de
index.html:

(a) sanitizeBackup / KNOWN_SHAPES (index.html:1614-1636) solo valida claves
conocidas; cualquier otra clave string ≤5 MB se acepta tal cual, y
«diario-reflexion-v1» no está en KNOWN_SHAPES, así que entra sin validar (y luego
se renderiza sin escapar).

(b) El nombre del archivo de respaldo usa sections.length === 4 (index.html:1580)
para decidir el prefijo; con 5 secciones el nombre incluye siempre el prefijo
largo.

Tarea:
1. Convierte KNOWN_SHAPES en lista blanca estricta: rechaza/ignora (con aviso)
   cualquier clave fuera de la lista. Añade «diario-reflexion-v1» con validación
   real de forma (entradas por fecha: tipos y longitudes razonables). Incluye
   TODAS las claves legítimas actuales (5 secciones, hub-logros-v1, recordatorios)
   para no romper importaciones válidas.
2. Sustituye el === 4 (index.html:1580) por el número real de secciones
   (Object.keys(SECTION_KEYS).length o la fuente de verdad equivalente).

Antes de editar, lee sanitizeBackup/KNOWN_SHAPES y la generación del nombre
(index.html:1580), y enumera las claves reales (SECTION_KEYS + recordatorios +
logros) para la lista blanca. Verifica: importar una clave desconocida o un Diario
malformado se rechaza; importar un respaldo legítimo de las 5 secciones funciona;
exportar todas las secciones produce el nombre corto. Muéstrame el diff y la
lista blanca final.
```

---

## Fase 2 — Recordatorios, ciclo de vida y limpieza de sync

### [x] Paso 4 — M2: Puerta única de recordatorios
*(fusiona los prompts 4 y 5)*

```
En este proyecto («Mi Diario», PWA), centraliza la persistencia de los
recordatorios en una única puerta de escritura, resolviendo dos fallos que
comparten el mismo punto de código (saveTareasRem index.html:1412, saveInglesRem
index.html:1423):

(a) Doble escritor / lost update: el hub escribe directo en todo-reminders y en
el campo recordatorio de planIngles_v1, pero los iframes mantienen su state en
memoria y al guardar reescriben TODA la clave (plan-ingles/estudio-ingles.html:388
save() reescribe todo state; igual el iframe de Tareas), borrando el ajuste que
puso el hub.

(b) El recordatorio de Tareas del hub no llega al SW: checkReminders
(To-do/sw.js:56) lee el registro «reminders» de IndexedDB, que solo mantiene
saveReminders (To-do/index.html:2178). El hub solo escribe localStorage
todo-reminders, así que si el usuario activa el aviso en Ajustes y no abre
Tareas, el SW usa valores viejos y nunca notifica.

Tarea:
1. Crea/usa una única puerta de escritura del recordatorio que: (i) no sea
   pisada por la copia obsoleta del iframe, y (ii) espeje SIEMPRE a IndexedDB en
   el mismo formato que espera el SW (To-do/sw.js:56) y produce
   To-do/index.html:2178.
   Opciones (elige y coméntame): que el hub, tras escribir, notifique/recargue el
   iframe vivo para que relea (como applyRemoteChanges); o mover el ajuste de
   recordatorio fuera de las claves de datos de la sección; o forzar que todas
   las escrituras pasen por DiarioStore.
2. Para Tareas, el mismo flujo escribe localStorage + IndexedDB. Para Inglés,
   evita que el save() del iframe borre el campo recordatorio.
3. Reutiliza idbGet/idbSet y NO dupliques el formato del registro «reminders»;
   factorízalo si hace falta.

Antes de editar, lee saveTareasRem y saveInglesRem (index.html), el save() de
plan-ingles/estudio-ingles.html, saveReminders (To-do/index.html:2178),
checkReminders (To-do/sw.js:56) y DiarioStore. Evita bucles de recarga. Verifica:
activar recordatorio en Ajustes SIN abrir la sección → IndexedDB actualizado y el
SW lo ve; activar y luego usar la sección → el recordatorio sigue activo.
Muéstrame la opción elegida y el diff.
```

### [x] Paso 5 — Prompt 9: Recordatorio de Inglés sin service worker

```
En este proyecto («Mi Diario», PWA), el recordatorio de Inglés casi nunca
dispara porque no usa service worker. A diferencia de Tareas (que tiene
periodicsync/sync en su SW), el aviso de Inglés se basa en un setInterval dentro
del iframe: plan-ingles/estudio-ingles.html:633 (checkRecordatorio +
setInterval), que solo corre si la pestaña Inglés está cargada y en primer
plano. Ni el SW del hub ni el de Tareas gestionan este recordatorio. Mientras
tanto, la UI de Ajustes (index.html:1480) muestra «Activo — hora: 19:00»,
sugiriendo un aviso programado que en la práctica casi nunca llega.

Tarea (elige y coméntame la opción):
- Opción A (preferida): implementar el chequeo del recordatorio de Inglés en un
  service worker (reutilizando el patrón del SW de Tareas: To-do/sw.js, con su
  registro en IndexedDB y el cálculo de avisos con la app cerrada). Centraliza
  la fuente de la hora/estado del recordatorio de Inglés para que el SW la lea.
- Opción B (mínima, si A es demasiado): ser explícito en la UI de Ajustes
  (index.html:1480) de que el recordatorio de Inglés SOLO avisa con la app
  abierta, para no prometer algo que no cumple.

Antes de editar, lee checkRecordatorio y su setInterval en
plan-ingles/estudio-ingles.html, el SW de Tareas (To-do/sw.js) como referencia,
y dónde se guarda la config del recordatorio de Inglés (revisa también el
trabajo del doble-escritor planIngles_v1). Si haces la Opción A, evita duplicar
lógica de notificaciones: reutiliza helpers existentes. Verifica el escenario
con la pestaña cerrada. Muéstrame la opción elegida y el diff.
```

### [x] Paso 6 — Prompt 10: La recarga de iframes descarta entradas en curso

```
En este proyecto («Mi Diario», PWA), cuando llega un cambio de la nube para una
sección cargada, el hub recarga su iframe vía
f.contentWindow.location.reload() en applyRemoteChanges (index.html:630-639). Si
el usuario está a medio escribir (p. ej. el modal de nueva tarea en To-do, o el
textarea de writing de Inglés antes del autoguardado), ese contenido en curso se
pierde.

Tarea:
1. Antes de recargar un iframe en applyRemoteChanges (index.html:630-639),
   comprueba si en ese iframe hay un modal abierto o un campo de entrada con
   foco / con texto sin guardar. Si lo hay, NO recargues: pospón la recarga
   (p. ej. reintenta cuando se cierre el modal / se pierda el foco / tras el
   autoguardado) o muestra un aviso no intrusivo para que el usuario aplique los
   cambios cuando quiera.
2. La detección debe funcionar desde el hub hacia el iframe: define un protocolo
   simple (p. ej. el iframe expone su estado "ocupado" vía postMessage o una
   bandera consultable; o el hub pregunta y el iframe responde antes de
   recargar). Coméntame el mecanismo elegido.
3. Asegura que el cambio remoto no se PIERDE: si se pospone, debe aplicarse en
   cuanto sea seguro.

Antes de editar, lee applyRemoteChanges en index.html y cómo se comunican hub e
iframes (busca postMessage existentes). Reutiliza el canal de mensajería que ya
exista. Verifica: con el modal de nueva tarea abierto en To-do, un cambio remoto
NO debe cerrar el modal ni borrar lo escrito, y el cambio remoto debe aplicarse
al cerrar el modal. Muéstrame el diff.
```

### [x] Paso 7 — Prompt 7: Código muerto de sync en Tareas + SDK Firebase

```
En este proyecto («Mi Diario», PWA), la app de Tareas contiene ~280 líneas de
código muerto de sincronización que duplican el motor del hub. Como
FIREBASE_CONFIG es null (To-do/firebase-config.js:25), cloudInit() retorna de
inmediato y todo el bloque de sync propio de Tareas
(To-do/index.html:2039-2161: cloudInit, startSync, mergeStates, adoptRemote,
pushState…) NUNCA se ejecuta. Reimplementa, con peor estrategia
(último-escribe-gana de documento completo en adoptRemote), lo que ya resuelven
shared/sync.js y shared/merge.js. Además sigue cargando los 3 SDK de Firebase en
cada apertura de Tareas, aumentando el tamaño descargado. Riesgo extra: si
alguien repusiera la config aquí, habría dos escritores sobre users/{uid}.

Tarea:
1. Elimina el bloque muerto de sincronización en To-do/index.html
   (~2039-2161: cloudInit, startSync, mergeStates, adoptRemote, pushState y
   cualquier helper o variable que SOLO use ese bloque, p. ej. enablePersistence
   en To-do/index.html:2136, también muerto).
2. Elimina la carga de los SDK de Firebase en To-do/index.html (las etiquetas
   <script> de gstatic ~899-901) y To-do/firebase-config.js si queda huérfano.
   La app suelta de Tareas funciona en local sin ellos; la sincronización real
   la hace el hub.
3. Antes de borrar, verifica con búsquedas que ninguna de esas funciones/variables
   se llama desde otro sitio vivo (grep por cloudInit, startSync, adoptRemote,
   pushState, mergeStates, FIREBASE_CONFIG en To-do/). Si algo se usa fuera del
   bloque muerto, no lo borres: avísame.

Antes de editar, lee To-do/index.html alrededor de 2039-2161 y 899-901, y
To-do/firebase-config.js. Tras borrar, comprueba que la app de Tareas sigue
abriendo y funcionando en local (sin errores de consola por referencias
perdidas) y que el SW de Tareas (que SÍ se usa para notificaciones) no depende
de nada eliminado. Muéstrame el diff y la lista de lo que confirmaste que estaba
muerto.
```

### [x] Paso 8 — Prompt 12: enablePersistence deprecado
*(después del Paso 7, que borra el uso muerto en :2136)*

```
En este proyecto («Mi Diario», PWA), se usa la API deprecada de persistencia
offline de Firestore. En Firebase 10.x,
enablePersistence({synchronizeTabs}) está deprecado a favor de la configuración
de caché (FirestoreSettings.cache / persistentLocalCache). Punto vivo:
shared/sync.js:135. (Nota: To-do/index.html:2136 también lo usa, pero es código
muerto que debería eliminarse aparte.) Funciona hoy, pero romperá en una futura
versión mayor del SDK y se arriesga a perder la caché offline en silencio.

Tarea:
1. Migra shared/sync.js:135 de enablePersistence({synchronizeTabs:true}) a la
   nueva API: inicializa Firestore con persistentLocalCache y
   persistentMultipleTabManager (equivalente a synchronizeTabs) en la
   configuración de caché, según la versión del SDK que carga el proyecto.
2. Comprueba qué versión exacta del SDK de Firebase se carga (revisa las URLs de
   gstatic en index.html y package.json) y usa la API correcta para esa versión;
   si la versión es anterior a la que soporta persistentLocalCache, fíjala
   conscientemente o súbela, y dímelo.
3. No reintroduzcas el uso en To-do/index.html (eso es código muerto a borrar en
   otra tarea); aquí solo el punto vivo de shared/sync.js.

Antes de editar, lee la inicialización de Firestore en shared/sync.js y confirma
la versión del SDK. Mantén el comportamiento offline actual (caché persistente +
sincronización entre pestañas). Verifica que no aparecen warnings de
deprecación en consola y que la app sigue funcionando offline. Muéstrame el diff
y la versión de SDK asumida.
```

---

## Fase 3 — Seguridad (inyección)

### [x] Paso 9 — Prompt 8: XSS almacenado en notas de Ejercicio y texto del Diario

```
En este proyecto («Mi Diario», PWA), hay XSS almacenado por inyectar texto de
usuario en innerHTML sin sanear. A diferencia de Tareas (que usa una función
esc()), las notas de sesión de Ejercicio se concatenan crudas:
Ejercicio/entrenamientos.html:781 (📝 ${s.notas}) y :772 (edición); y el snippet
del Diario se inyecta sin escapar en index.html:1326 (cal-dv-body). Aunque el
origen sea el propio usuario (self-XSS), estos datos también llegan por
sincronización desde otro dispositivo o al importar un respaldo JSON, y se
renderizan automáticamente, ejecutando <img onerror=…> o similares en el origen
de la app (acceso a localStorage, tokens de Firebase de la pestaña, etc.).

Tarea:
1. Escapa TODO texto de usuario antes de inyectarlo en innerHTML en los tres
   puntos: notas de Ejercicio (visualización y edición) y snippet del Diario en
   el calendario. Reutiliza el patrón esc() de Tareas (o textContent donde sea
   viable sin romper el HTML circundante).
2. Si esc() vive solo en To-do/index.html, factorízalo a un sitio reutilizable
   (p. ej. un helper en shared/) o duplícalo de forma idéntica donde haga falta;
   coméntame qué opción tomas.
3. Revisa en Ejercicio/entrenamientos.html y en el render del Diario si hay
   otros campos de usuario que también se concatenen en innerHTML y aplícales lo
   mismo.
4. Considera añadir una CSP razonable (lo trataremos aparte, pero menciona si
   algún cambio aquí la facilitaría).

Antes de editar, lee la función esc() de Tareas y los tres puntos de inyección.
Verifica con una nota de prueba que contenga <img src=x onerror=alert(1)> y
<script>: debe mostrarse como texto literal, no ejecutarse, tanto en Ejercicio
como en el calendario del Diario. Muéstrame el diff.
```

### [x] Paso 10 — Prompt 17: Sin CSP ni SRI
*(refuerza el Paso 9: hacerlo después)*

```
En este proyecto («Mi Diario», PWA), los scripts del SDK de Firebase se cargan
desde gstatic.com sin integrity/crossorigin y no hay Content-Security-Policy:
index.html:570-572 y To-do/index.html:899-901. Riesgo bajo (es Google), pero
deja sin mitigación los vectores de XSS internos y esos scripts cross-origin no
se cachean para offline.

Tarea (coméntame la opción elegida):
1. Añade una Content-Security-Policy razonable (vía <meta http-equiv> ya que es
   estático/PWA) que permita lo que la app necesita (Firestore/Firebase,
   gstatic, los inline actuales si los hay) y restrinja el resto. Apunta a
   reducir la superficie de XSS sin romper la app.
2. Para los <script> de gstatic, valora:
   - añadir integrity (SRI) + crossorigin="anonymous", o
   - autoalojar el SDK de Firebase (mejora también el offline, porque hoy esos
     scripts cross-origin no se cachean por el SW).
3. Aplica la misma estrategia en index.html y To-do/index.html.

Importante: una CSP mal puesta rompe la app. Antes de editar, localiza TODO lo
que cargue/ejecute scripts (inline handlers, eval, SDK, theme.js, etc.) e inventa
una política que los cubra; empieza permisiva y ajústala. Tras el cambio,
verifica que el hub y Tareas cargan sin errores de CSP en consola, que la
sincronización con Firestore sigue funcionando y que no se rompen los onclick
inline existentes. Muéstrame el diff y la política final.
```

---

## Fase 4 — Accesibilidad

### [ ] Paso 11 — Prompt 6: Accesibilidad (zoom, labels, teclado, contraste)

```
En este proyecto («Mi Diario», PWA), corrige cuatro barreras de accesibilidad
(incumplen WCAG AA):

1. Zoom desactivado (WCAG 1.4.4): index.html:5 tiene
   maximum-scale=1.0, user-scalable=no en el meta viewport. Quítalo para
   permitir pinch-zoom.
2. Labels no asociadas: en los modales de Tareas/Objetivos las <label> no tienen
   for/id que las una a su input (To-do/index.html:788 y alrededores). Asocia
   cada label con su input (atributos for/id) para que se enfoquen al pulsarlas
   y las anuncien los lectores de pantalla.
3. Elementos no operables por teclado: las celdas del calendario
   (index.html:1290) y de la cuadrícula de estados de ánimo del Diario
   (index.html:1180) son <div> con onclick: no reciben foco ni se activan con
   teclado. Conviértelas en <button> (o añade role="button", tabindex="0" y
   manejo de Enter/Espacio) sin romper su estilo actual.
4. Contraste bajo: el texto secundario (--text-secondary #86868b sobre #f5f5f7)
   ronda 3.3:1, por debajo del 4.5:1 AA. Sube el contraste de
   --text-secondary a un valor que cumpla 4.5:1, comprobándolo también en tema
   oscuro.

Antes de editar, localiza la variable CSS --text-secondary y todos los sitios
donde se generan esas celdas <div> clicables (puede haber varios). Conserva la
estética "tipo iOS": al pasar <div> a <button>, resetea los estilos por defecto
del botón (background, border, padding, font) para que se vea igual. Tras los
cambios, verifica que se puede navegar por teclado (Tab + Enter/Espacio) por el
calendario y la cuadrícula de ánimo. Muéstrame el diff.
```

---

## Fase 5 — Menores / limpieza (independientes entre sí)

### [ ] Paso 12 — Prompt 14: Código muerto export/import + remOn/remHora

```
En este proyecto («Mi Diario», PWA), hay código muerto inalcanzable desde la UI
porque el respaldo se hace globalmente desde el hub:

1. Movilidad/index.html:493 — funciones resetAll, exportarMov y el disparador
   movImport sin botón en el DOM, más .footer-actions en CSS sin uso.
2. plan-ingles/estudio-ingles.html:653 — exportIng / importIngBtn que no
   existen en el HTML.
3. plan-ingles/estudio-ingles.html:626-630 — el código accede a
   getElementById("remOn") / "remHora" (→ null, protegido con if), pero esos
   controles no existen en el HTML (el toggle real vive en Ajustes del hub).
   Hay incluso CSS #remHora sin elemento.

Están protegidas con if (el), así que no rompen, pero sobran y confunden.

Tarea:
- Elimina las funciones, listeners, referencias DOM y reglas CSS que sean
  INALCANZABLES desde la UI de cada sección (export/import de Movilidad e Inglés,
  remOn/remHora, .footer-actions, #remHora).
- Antes de borrar cada cosa, confirma con búsqueda que no se llama/usa desde
  ningún punto vivo (incluido el hub vía postMessage). Si algo sí se usa, no lo
  borres: avísame.

Antes de editar, lee las zonas indicadas en Movilidad/index.html y
plan-ingles/estudio-ingles.html. Verifica que ambas secciones siguen abriendo y
funcionando sin errores de consola tras la limpieza. Muéstrame el diff y la lista
de lo que confirmaste muerto.
```

### [ ] Paso 13 — Prompt 15: Ejercicio no carga shared/theme.js

```
En este proyecto («Mi Diario», PWA), Movilidad e Inglés incluyen
shared/theme.js, pero Ejercicio/entrenamientos.html no lo carga (cabecera
~líneas 1-7) y tampoco tiene lógica de tema propia. Dentro del hub funciona
porque el hub fija data-theme directamente en el documentElement del iframe,
pero abierto directamente, Ejercicio se queda en claro aunque el sistema esté en
oscuro.

Tarea:
- Añade <script src="../shared/theme.js"></script> en la cabecera de
  Ejercicio/entrenamientos.html, en la misma posición/forma en que lo cargan
  Movilidad e Inglés (revisa cómo lo hacen para copiar el patrón exacto: ruta
  relativa, orden respecto a otros scripts).

Antes de editar, abre Movilidad/index.html y plan-ingles/estudio-ingles.html
para ver cómo y dónde incluyen theme.js. Verifica: abrir
Ejercicio/entrenamientos.html en solitario con el sistema en modo oscuro debe
aplicar el tema oscuro, y dentro del hub debe seguir funcionando igual.
Muéstrame el diff.
```

### [ ] Paso 14 — Prompt 18: Notification.requestPermission() automático en Inglés

```
En este proyecto («Mi Diario», PWA), Inglés pide permiso de notificaciones nada
más cargar, sin gesto del usuario, y desde un iframe (donde muchos navegadores
lo ignoran): plan-ingles/estudio-ingles.html:613. Lo recomendado es pedirlo solo
tras una acción explícita.

Tarea:
- Elimina la llamada automática a Notification.requestPermission() al cargar
  (plan-ingles/estudio-ingles.html:613).
- Solicita el permiso ÚNICAMENTE cuando el usuario active el recordatorio, igual
  que ya hace el hub en Ajustes. Si el control de activación del recordatorio de
  Inglés vive en Ajustes del hub (no en el iframe), asegúrate de que el permiso
  se pide ahí en el momento de activar, y de que el iframe no lo vuelva a pedir
  al cargar.

Antes de editar, lee cómo el hub pide el permiso en Ajustes (index.html) para
imitar ese patrón, y el contexto de la línea 613 en
plan-ingles/estudio-ingles.html. Verifica: abrir Inglés NO debe disparar el
prompt de permiso; activar el recordatorio SÍ. Muéstrame el diff.
```

### [ ] Paso 15 — Prompt 16: Dos service workers / addAll frágil

```
En este proyecto («Mi Diario», PWA), coexisten dos service workers con ámbitos
solapados: el del hub (ámbito /) y el de Tareas (/To-do/). El hub cachea recurso
a recurso tolerando fallos (sw.js:23, per-item con catch), pero el de Tareas usa
c.addAll(ASSETS) (To-do/sw.js:6), que ABORTA toda la instalación si cualquier
recurso falla (red intermitente, 404). Además ambos cachean los mismos archivos
de Tareas (doble caché).

Tarea:
1. Cambia To-do/sw.js:6 de addAll(ASSETS) a un cacheado per-item tolerante a
   fallos (cache.add por recurso con catch que registre el fallo pero no aborte
   la instalación), reutilizando el mismo patrón que sw.js:23.
2. Aclara/reduce el solapamiento de caché: revisa la lista ASSETS de ambos SW y
   evita que los dos cacheen exactamente los mismos archivos de Tareas. Documenta
   con un comentario qué ámbito es responsable de qué.

Antes de editar, lee la instalación (install/caches.open/addAll) de To-do/sw.js
y la de sw.js para copiar el patrón tolerante. Verifica que el SW de Tareas se
instala aunque un recurso de la lista no exista (simula un 404 en la lista).
Muéstrame el diff.
```

### [ ] Paso 16 — Prompt 11: Fuga de AudioContext en Inglés

```
En este proyecto («Mi Diario», PWA), el temporizador de Inglés crea AudioContext
de más y nunca los cierra. Al terminar un bloque se crea un AudioContext que se
descarta sin usar (plan-ingles/estudio-ingles.html:587: new AudioContext();
beep();) y luego beep() crea OTRO (:595). Ninguno se close(). Los navegadores
limitan los AudioContext simultáneos (~6); tras varios bloques los beep dejan de
sonar.

Tarea:
1. Usa un ÚNICO AudioContext reutilizable para toda la sección (créalo una vez,
   de forma perezosa tras el primer gesto del usuario para cumplir las políticas
   de autoplay) y reúsalo en cada beep en vez de crear uno nuevo cada vez.
2. Elimina la creación duplicada de la línea ~587 (el AudioContext "de
   desbloqueo" que se descarta) si ya no hace falta, o intégrala en el contexto
   único; si su propósito era desbloquear audio, hazlo sobre el mismo contexto
   compartido (resume()).
3. Si en algún flujo conviene liberar, cierra el contexto con close() al
   desmontar/cerrar la sección; pero la prioridad es no acumular contextos.

Antes de editar, lee la lógica de beep() y del fin de bloque en
plan-ingles/estudio-ingles.html (líneas ~585-600). Verifica: ejecutar varios
bloques seguidos (>6) y comprobar que el beep sigue sonando y que no se acumulan
AudioContext. Muéstrame el diff.
```

### [ ] Paso 17 — Prompt 19: renderDash tiene efecto secundario (persiste logros)

```
En este proyecto («Mi Diario», PWA), el render del dashboard tiene un efecto
secundario: calcularlo escribe hub-logros-v1 en localStorage
(index.html:995-1002). renderDash se invoca desde el evento storage, desde
applyRemoteChanges, etc., así que mezclar render con persistencia dificulta el
razonamiento y puede generar escrituras inesperadas (y potencial churn de sync).

Tarea:
- Separa el CÁLCULO/PERSISTENCIA de logros del RENDER puro. Extrae el cálculo de
  logros y su escritura en hub-logros-v1 a una función propia que se llame en los
  momentos adecuados (cuando cambian los datos de origen), y deja renderDash como
  render sin efectos secundarios (solo lee y pinta).
- Asegúrate de que los logros se siguen persistiendo cuando corresponde, pero NO
  en cada render disparado por storage/applyRemoteChanges.

Antes de editar, lee renderDash (index.html:995-1002) y todos sus puntos de
llamada (storage, applyRemoteChanges, etc.) para decidir dónde colocar el cálculo
de logros. Verifica que los logros siguen actualizándose con el uso normal pero
que abrir/recibir un cambio remoto no reescribe hub-logros-v1 innecesariamente.
Muéstrame el diff.
```

### [ ] Paso 18 — Prompt 21: buildStats de Tareas puede contar de más

```
En este proyecto («Mi Diario», PWA), buildStats de Tareas
(To-do/index.html:1870-1878) infla el conteo de «esta semana»: doneWeek se
incrementa por varias vías (historial diario + clave semanal + clave mensual +
completedAt) que pueden solaparse para una MISMA tarea, contándola más de una
vez.

Tarea:
- Reescribe el cálculo de doneWeek para contar por conjunto ÚNICO (p. ej. un Set
  de identificadores de tarea, o de días/tarea según lo que se quiera medir),
  de modo que una misma tarea completada no se sume por varias vías.
- Aclara con un comentario qué representa exactamente la métrica (tareas únicas
  completadas esta semana) y asegúrate de que las otras métricas cercanas no
  sufran el mismo doble conteo.

Antes de editar, lee buildStats (To-do/index.html:1870-1878) y entiende las
cuatro fuentes (historial diario, clave semanal, clave mensual, completedAt) y
cómo se solapan. Si puedes, añade un test que reproduzca el solapamiento (una
tarea presente en varias fuentes debe contar 1). Verifica con datos de ejemplo
que el total ya no se infla. Muéstrame el diff.
```

---

## Mapa de origen (hallazgo → paso)

| Auditoría | Severidad | Paso del plan |
|-----------|-----------|---------------|
| Diario sin sync ni fusión | CRÍTICO | 2 |
| Reversión de tareas offline (sin updatedAt) | CRÍTICO | 1 (M1) |
| Sin tombstones | ALTO | 1 (M1) |
| Doble escritor hub/iframe (recordatorio) | ALTO | 4 (M2) |
| Recordatorio Tareas no llega al SW | ALTO | 4 (M2) |
| Accesibilidad | ALTO | 11 |
| Código muerto de sync en Tareas | ALTO | 7 |
| XSS almacenado | MEDIO | 9 |
| Recordatorio Inglés sin SW | MEDIO | 5 |
| Recarga de iframe descarta entrada | MEDIO | 6 |
| Fuga de AudioContext | MEDIO | 16 |
| enablePersistence deprecado | MEDIO | 8 |
| Saneo de respaldo permisivo | MEDIO | 3 (M3) |
| Código muerto export/import + remOn/remHora | BAJO | 12 |
| Ejercicio sin theme.js | BAJO | 13 |
| Dos SW / addAll frágil | BAJO | 15 |
| Sin CSP/SRI | BAJO | 10 |
| requestPermission automático | BAJO | 14 |
| renderDash con efecto secundario | BAJO | 17 |
| Prefijo de respaldo (=== 4) | BAJO | 3 (M3) |
| Doble conteo buildStats | BAJO | 18 |
| Cobertura de tests / churn | BAJO | 1 (M1) |
