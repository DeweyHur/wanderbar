import { googleAvailable } from "@/lib/google";
import { json } from "@/lib/http";
import { testLoginEnabled } from "@/lib/testLogin";

/** What the server offers (no secrets): place search, and test sign-in (end-to-end tests and staging only). */
export const GET = () => json({ googlePlaces: googleAvailable(), testLogin: testLoginEnabled() });
