/**
 * Per-file server bootstrap.
 *
 * node --test runs each file in its own process, in parallel. Sharing one
 * server between files would make them race on the same database, so every API
 * file boots its own instance on its own port with its own temp directory.
 */

import { after, before } from "node:test";
import { startServer } from "./harness.mjs";

let nextPort = 3750 + Math.floor(Math.random() * 200);

/**
 * Registers before/after hooks and returns a getter for the server.
 *
 * Usage:
 *   const server = await useServer("w1");
 *   const api = new Client(server().base);
 */
export function useServer(version = process.env.CARMATCH_TEST_VERSION ?? "w1", opts = {}) {
  const port = nextPort++;
  let server;

  before(async () => {
    server = await startServer(version, { port, ...opts });
  });

  after(async () => {
    await server?.stop();
  });

  return () => {
    if (!server) throw new Error("servidor ainda não subiu");
    return server;
  };
}
