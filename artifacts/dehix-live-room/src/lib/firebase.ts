import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
const appId = import.meta.env.VITE_FIREBASE_APP_ID as string;

export const isFirebaseEnabled = !!(apiKey && projectId && appId && apiKey !== "undefined");

let db: ReturnType<typeof getFirestore> | null = null;

if (isFirebaseEnabled) {
  try {
    const app = initializeApp({
      apiKey,
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
      appId,
    });
    db = getFirestore(app);
  } catch (e) {
    console.warn("Firebase init failed — using local chat mode");
  }
}

export { db };
