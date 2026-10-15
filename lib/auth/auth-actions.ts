import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, type Auth, type UserCredential } from "firebase/auth";

const networkFailure = (error: unknown) => (error as { code?: string })?.code === "auth/network-request-failed";
export async function retryAuthConnection<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { if (!networkFailure(error)) throw error; return action(); }
}

const operations = { create: createUserWithEmailAndPassword, signIn: signInWithEmailAndPassword, profile: updateProfile };
export async function registerWithName(auth: Auth, email: string, password: string, name: string, sdk = operations): Promise<UserCredential> {
  let credential: UserCredential;
  try { credential = await sdk.create(auth, email, password); }
  catch (error) {
    if (!networkFailure(error)) throw error;
    // Firebase may have created the account before a later lookup failed.
    // Recover that identity with the supplied password, never register twice.
    try { credential = await retryAuthConnection(() => sdk.signIn(auth, email, password)); }
    catch { throw error; }
  }
  await retryAuthConnection(() => sdk.profile(credential.user, { displayName: name.trim() }));
  return credential;
}
