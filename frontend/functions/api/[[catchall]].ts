export const onRequest = async (context: { request: Request }) => {
  const url = new URL(context.request.url);
  const targetUrl = `https://backend.aaditmehta45.workers.dev${url.pathname}${url.search}`;
  
  const headers = new Headers(context.request.headers);
  headers.set("X-Forwarded-Host", url.host);
  headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));

  const init: RequestInit = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
    // @ts-expect-error duplex needed for streaming fetch bodies in workers
    init.duplex = "half";
  }

  return fetch(targetUrl, init);
};
