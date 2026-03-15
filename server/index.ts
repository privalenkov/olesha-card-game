import { serverConfig } from './config.js';
import { buildApp } from './app.js';

const app = await buildApp();

try {
  await app.listen({
    port: serverConfig.port,
    host: serverConfig.host,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
