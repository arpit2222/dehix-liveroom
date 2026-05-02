import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID as string}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID as string}.firebasestorage.app`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
