/**
 * Middleware exports
 */

export {
  authPlugin,
  type AuthPluginOptions,
  type ApiKeyStore,
  InMemoryApiKeyStore,
  hashApiKey,
  generateApiKey,
} from './auth.js';

export { errorHandlerPlugin } from './error-handler.js';
