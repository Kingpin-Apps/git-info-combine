/** Serves .out/cards/ for previewing rendered cards: bun run preview */
const port = Number(process.env.PORT ?? 4321);
Bun.serve({
  port,
  async fetch(request) {
    const path = new URL(request.url).pathname.replace(/^\/+/, "") || "index.html";
    if (path.includes("..")) return new Response("Not found", { status: 404 });
    const file = Bun.file(`.out/cards/${path}`);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
console.log(`Preview at http://localhost:${port}`);
