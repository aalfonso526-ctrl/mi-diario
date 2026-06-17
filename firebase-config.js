/* ============================================================
   Configuración de Firebase del HUB "Mi Diario".

   El hub centraliza la sincronización de las 5 secciones (ver shared/sync.js).
   La apiKey de Firebase es pública por diseño: la barrera real de seguridad
   son las reglas de Firestore (firestore.rules) y los dominios autorizados
   en la consola de Firebase → Authentication → Settings.

   Tareas ya NO carga el SDK de Firebase ni sincroniza por su cuenta; el hub es
   el único escritor del documento users/{uid}.
   ============================================================ */
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyAR2HXEMA_XP4PuZaiZ2IWtyrF5Z4B_tbk",
  authDomain: "mis-tareas-97b8d.firebaseapp.com",
  projectId: "mis-tareas-97b8d",
  storageBucket: "mis-tareas-97b8d.firebasestorage.app",
  messagingSenderId: "342091244780",
  appId: "1:342091244780:web:4942669d9f8177a8ab31c9"
};
