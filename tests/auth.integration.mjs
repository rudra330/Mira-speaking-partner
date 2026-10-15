// Preserve the integration entry point under the new Drive-only policy.
// Real Firebase checks are opt-in and create only disposable test identities.
await import("./firebase-production.integration.mjs");
