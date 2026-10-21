import { relayAuth0 } from "@/lib/server/auth0";

const FIELDS = ["code", "state", "id_token", "error", "error_description"] as const;

export async function GET(req: Request) {
  return relayAuth0(req, "/callback", FIELDS);
}

// Auth0 posts the result back here (response_mode=form_post).
export async function POST(req: Request) {
  return relayAuth0(req, "/callback", [], FIELDS);
}
