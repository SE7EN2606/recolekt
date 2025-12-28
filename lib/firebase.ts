import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// ✅ Your actual Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBJGMU8vb3NQNvh3GrUJ3GyF2ywg_x5pSg",
  authDomain: "recolekt-app.firebaseapp.com",
  projectId: "recolekt-app",
  storageBucket: "recolekt-app.firebasestorage.app",
  messagingSenderId: "195253884000",
  appId: "1:195253884000:web:701431af6ed884e1b75f05"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
