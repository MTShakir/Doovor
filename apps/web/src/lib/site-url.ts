import { brand } from '@repo/config/brand';
import { getAppUrl } from './app-url';

/**
 * Base URL of the public site in the current environment (D-084, D-109): the bare domain wherever
 * the app runs on its own host, and the same host as the app everywhere else, a preview
 * deployment or this machine, which serve both.
 */
export function getSiteUrl(): string {
  const app = getAppUrl();
  return app === brand.appUrl ? brand.productionUrl : app;
}
