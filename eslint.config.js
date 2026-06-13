/* Configuración de ESLint (flat config, CommonJS).
   Solo se lintean los archivos .js sueltos (módulos compartidos y service
   workers); el JS embebido en los .html no se analiza. Las claves de cada
   sección de localStorage y los globals del navegador/SW se declaran para que
   no salten como "no definidos". */
const js = require("@eslint/js");
const globals = require("globals");

const BASE_RULES = {
  ...js.configs.recommended.rules,
  /* El proyecto usa catch vacío a propósito (degradar sin romper). */
  "no-empty": ["error", { allowEmptyCatch: true }],
  /* Variables sin usar como aviso (no tumban la build) y sin revisar el
     parámetro de catch, que se omite a propósito en los catch vacíos. */
  "no-unused-vars": ["warn", { caughtErrors: "none" }]
};

module.exports = [
  { ignores: ["node_modules/**", "coverage/**"] },

  {
    files: ["shared/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        ...globals.browser,
        firebase: "readonly",
        DiarioStore: "readonly",
        DiarioMerge: "readonly",
        DiarioSync: "readonly"
      }
    },
    rules: BASE_RULES
  },

  {
    files: ["sw.js", "To-do/sw.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: { ...globals.serviceworker, ...globals.browser }
    },
    rules: BASE_RULES
  },

  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: BASE_RULES
  }
];
