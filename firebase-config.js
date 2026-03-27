import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD9zO7KYM7ALgLnzgdZr3IiiJyu1M-aYWk",
  authDomain: "stilo-premium.firebaseapp.com",
  projectId: "stilo-premium",
  storageBucket: "stilo-premium.firebasestorage.app",
  messagingSenderId: "998169786088",
  appId: "1:998169786088:web:435a0724bcd5bda9547b5d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// usa autodetecção de long polling para ambientes onde proxy, antivírus ou extensão quebram o canal realtime
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});

export const TIMEZONE = "America/Sao_Paulo";
export const TIMEZONE_OFFSET = "-03:00";
export const SLOT_GRANULARITY_MINUTES = 5;
export const DEFAULT_WHATSAPP_NUMBER = "5511996511471";
