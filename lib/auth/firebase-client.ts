"use client";
import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, getAuth } from "firebase/auth";
import { firebaseConfig } from "./firebase-config";
let cachedIdentity: { uid: string; token: string } | null = null;

export function firebaseAuth() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      // Initialize Google's cross-origin popup only when Google is selected.
      // Email/password and session restoration do not need that iframe.
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/already-initialized") throw error;
    return getAuth(app);
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  const auth = firebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Please sign in to continue.");
  const token = await auth.currentUser.getIdToken();
  cachedIdentity = { uid: auth.currentUser.uid, token };
  return { Authorization: `Bearer ${token}` };
}

export function authHeadersSnapshot(): Record<string, string> {
  return cachedIdentity && firebaseAuth().currentUser?.uid === cachedIdentity.uid ? { Authorization: `Bearer ${cachedIdentity.token}` } : {};
}
