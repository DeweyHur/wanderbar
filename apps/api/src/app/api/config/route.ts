import { googleAvailable } from "@/lib/google";
import { json } from "@/lib/http";

/** What the server offers (no secrets): lets the apps hide place search when no Google key is set. */
export const GET = () => json({ googlePlaces: googleAvailable() });
