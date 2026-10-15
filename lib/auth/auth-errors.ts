export function authErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "That email or password doesn’t match. Try again, or reset your password.",
    "auth/wrong-password": "That email or password doesn’t match. Try again, or reset your password.",
    "auth/user-not-found": "That email or password doesn’t match. Try again, or reset your password.",
    "auth/email-already-in-use": "An account with this email already exists. Sign in instead, or reset your password.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password with at least 8 characters.",
    "auth/password-does-not-meet-requirements": "This password doesn’t meet the account’s security requirements. Try a longer password with uppercase, lowercase, numbers, and symbols.",
    "auth/too-many-requests": "There have been too many attempts. Please wait a little before trying again.",
    "auth/network-request-failed": "We couldn’t connect. Check your internet connection and try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed. You can try again when you’re ready.",
    "auth/cancelled-popup-request": "Another sign-in window is already open. Finish there or try again.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for Mira and try again.",
    "auth/unauthorized-domain": "Google sign-in isn’t enabled for this web address yet. The app owner needs to authorize it in Firebase.",
    "auth/operation-not-allowed": "This sign-in method isn’t enabled yet. The app owner needs to enable it in Firebase Authentication.",
    "auth/configuration-not-found": "Firebase Authentication isn’t set up yet. The app owner needs to enable it in the Firebase console.",
    "auth/account-exists-with-different-credential": "This email already uses another sign-in method. Sign in with your existing method first.",
    "auth/user-disabled": "This account has been disabled. Contact the app owner for help.",
    "auth/web-storage-unsupported": "Mira needs browser storage to keep you signed in. Allow site storage and try again.",
    "auth/operation-not-supported-in-this-environment": "Open Mira in Chrome, Safari, or Edge to continue with Google.",
  };
  return messages[code || ""] || "We couldn’t complete that request. Please try again.";
}
