export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmCaches } = await import("./lib/server/warm");
    void warmCaches(); // fire-and-forget; failures are silent (backend may start later)
  }
}
