import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/**
 * Substitua pelos dados do seu projeto Firebase.
 * Este arquivo pode ficar versionado normalmente no GitHub Pages ou na Vercel.
 */
export const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "COLE_AQUI.firebaseapp.com",
  projectId: "COLE_AQUI",
  storageBucket: "COLE_AQUI.firebasestorage.app",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

/**
 * O sistema foi oficialmente fixado em America/Sao_Paulo para evitar divergência
 * entre interface, agenda, persistência e painel administrativo.
 */
export const TIMEZONE = "America/Sao_Paulo";
export const TIMEZONE_OFFSET = "-03:00";
export const SLOT_GRANULARITY_MINUTES = 5;
export const DEFAULT_WHATSAPP_NUMBER = "5511996511471";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const firebaseApp = app;

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Não foi possível manter a sessão local no navegador.", error);
});
