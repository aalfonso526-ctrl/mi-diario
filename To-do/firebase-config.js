/* ============================================================
   CONFIGURACIÓN DE FIREBASE (sincronización en la nube)

   Mientras este valor sea null, la app funciona en modo local
   (sin nube) y el botón de sincronización permanece oculto.

   Cuando crees tu proyecto en https://console.firebase.google.com
   copia aquí el bloque "firebaseConfig" que te da Firebase.
   Debe quedar así (con TUS valores):

   var FIREBASE_CONFIG = {
     apiKey: "AIzaSy...",
     authDomain: "mis-tareas-xxxxx.firebaseapp.com",
     projectId: "mis-tareas-xxxxx",
     storageBucket: "mis-tareas-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ============================================================ */

var FIREBASE_CONFIG = null;
