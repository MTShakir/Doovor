import { badgeExpirySweep } from './functions/badge-expiry';
import { outboxSweep } from './functions/outbox-sweep';
import { systemPingFunction } from './functions/ping';

/** Every job the runner serves. Add new ones here. */
export const functions = [systemPingFunction, outboxSweep, badgeExpirySweep];
