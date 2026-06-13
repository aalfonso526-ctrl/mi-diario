# Mi Diario

PWA personal que reúne cuatro secciones en un solo lugar, dentro de un hub con
pestañas (`index.html`) que las embebe en iframes del mismo origen:

| Sección   | Archivo                              | Datos en localStorage           |
|-----------|--------------------------------------|---------------------------------|
| Tareas    | `To-do/index.html`                   | `todo-app-v1`, `todo-theme`     |
| Ejercicio | `Ejercicio/entrenamientos.html`      | `entreno_historial_v1`, `entreno_cfg_v1`, `entreno_draft_v1` |
| Movilidad | `Movilidad/index.html`               | `movilidad-progress`            |
| Inglés    | `plan-ingles/estudio-ingles.html`    | `planIngles_v1`                 |

- **Sin build**: HTML + CSS + JS vanilla en un único archivo por sección.
- **Offline-first**: service worker (`sw.js`) con estrategia *red primero, caché si falla*.
- **Tema** sincronizado: el hub calcula el tema efectivo (claro/oscuro/auto,
  guardado en `todo-theme`) y lo propaga a cada iframe vía `postMessage`.
- **Respaldo**: la pantalla "Hoy" exporta/importa todo el `localStorage` del origen
  a un JSON. Cada sección tiene además su propio export/import.

## Sincronización en la nube (opcional)

El **hub** sincroniza las **cuatro** secciones con Cloud Firestore de forma
centralizada: un único login (Google) desde la pantalla "Hoy" respalda y combina
`todo-app-v1`, `entreno_*`, `movilidad-progress` y `planIngles_v1` en el
documento `users/{uid}` con formato `{ _v: 2, sections: { clave: {data, updatedAt} } }`.

- **Un solo escritor:** la sincronización vive en el hub (`firebase-config.js` en
  la raíz + `shared/sync.js`). `To-do/firebase-config.js` vale `null`, así que la
  app de Tareas abierta por separado funciona en local pero no sincroniza.
- **Fusión por elemento** (`shared/merge.js`), no "gana la última escritura del
  documento": los días de Inglés/Movilidad se combinan sin perder progreso, las
  sesiones de Ejercicio se deduplican por fecha y las tareas por `id`.
- **Migración automática:** si ya tenías el formato anterior de Tareas
  (`{data, updatedAt}` en la raíz del documento), se conserva al primer
  sincronizado sin pérdida.
- Nada se escribe en la nube hasta iniciar sesión.

### Activar Firebase

1. Crea un proyecto en <https://console.firebase.google.com> con Authentication
   (proveedor Google) y Cloud Firestore.
2. Copia el bloque `firebaseConfig` que te da Firebase dentro de
   `firebase-config.js` (en la raíz).
3. **Despliega las reglas de seguridad** antes de guardar datos reales:

   ```bash
   # con Firebase CLI (npm i -g firebase-tools; firebase login)
   firebase deploy --only firestore:rules
   ```

   O pega el contenido de [`firestore.rules`](firestore.rules) en
   Firebase Console → Firestore Database → Rules → Publicar.

> ⚠️ La `apiKey` de Firebase es pública por diseño. La seguridad de tus datos
> depende **por completo** de `firestore.rules`: cada documento `users/{uid}`
> solo es accesible por su dueño autenticado. Sin esas reglas, cualquier usuario
> con sesión podría leer/escribir los datos de los demás.

## Estructura

```
index.html            Hub con pestañas + dashboard "Hoy" + respaldo global
manifest.json         Manifiesto PWA del hub
sw.js                 Service worker del hub (cachea el armazón y las 4 apps)
firestore.rules       Reglas de seguridad de Cloud Firestore
To-do/                Sección Tareas (+ su propio manifest/sw/iconos)
Ejercicio/            Sección Ejercicio
Movilidad/            Sección Movilidad
plan-ingles/          Sección Inglés
```
