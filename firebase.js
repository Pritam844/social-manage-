import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAY-z43aSqEvqhdKlIih4oCQR9PazKbrOg",
  authDomain: "yt-manager-8fa09.firebaseapp.com",
  projectId: "yt-manager-8fa09",
  storageBucket: "yt-manager-8fa09.firebasestorage.app",
  messagingSenderId: "1087594390135",
  appId: "1:1087594390135:web:04e22b91890603f76c5c72"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
