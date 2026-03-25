<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyD9zO7KYM7ALgLnzgdZr3IiiJyu1M-aYWk",
    authDomain: "stilo-premium.firebaseapp.com",
    projectId: "stilo-premium",
    storageBucket: "stilo-premium.firebasestorage.app",
    messagingSenderId: "998169786088",
    appId: "1:998169786088:web:1764eacd99eeb926547b5d",
    measurementId: "G-7NFZ9MDJ70"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>
