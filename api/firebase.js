import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const databaseURL = process.env.FIREBASE_DATABASE_URL || "https://bimz-panel-default-rtdb.firebaseio.com";

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Firebase server environment variables are missing");
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      databaseURL
    });

export const adminAuth = getAuth(app);
export const db = getDatabase(app);
