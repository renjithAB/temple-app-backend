declare module 'cloudflare:node' {
  export function handleAsNodeRequest(port: number, request: Request): Promise<Response>;
  export function httpServerHandler(options: { port: number }): {
    fetch: (request: Request, env: any, ctx: any) => Promise<Response>;
  };
}

