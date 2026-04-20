type InMemoryDelivery = {
  id: string;
  webhookId: string;
  receivedAt: string;
  body: string;
};

const port = Number(process.env.PORT ?? "8788");
const deliveries: Array<InMemoryDelivery> = [];

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "webhook-server" });
    }
    if (request.method === "GET" && url.pathname === "/internal/deliveries") {
      return json({ deliveries });
    }
    if (request.method === "POST" && url.pathname.startsWith("/i/")) {
      const webhookId = url.pathname.replace("/i/", "").trim();
      if (!webhookId) {
        return json({ error: "Invalid webhook id." }, 400);
      }
      const body = await request.text();
      const delivery: InMemoryDelivery = {
        id: crypto.randomUUID(),
        webhookId,
        receivedAt: new Date().toISOString(),
        body,
      };
      deliveries.unshift(delivery);
      return json({
        received: true,
        deliveryId: delivery.id,
      });
    }
    return json({ error: "Not found." }, 404);
  },
});

console.log(`[webhook-server] listening on http://localhost:${server.port}`);
