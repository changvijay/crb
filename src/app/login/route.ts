import { relayAuth0 } from "@/lib/server/auth0";

export async function GET(req: Request) {
  return relayAuth0(req, "/login", ["returnTo"]);
}
