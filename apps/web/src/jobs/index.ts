import { badgeExpirySweep } from './functions/badge-expiry';
import { maintenanceSweep, requestExpirySweep } from './functions/maintenance';
import { outboxSweep } from './functions/outbox-sweep';
import { systemPingFunction } from './functions/ping';

/** Every job the runner serves. Add new ones here. */
export const functions = [systemPingFunction, outboxSweep, badgeExpirySweep, maintenanceSweep, requestExpirySweep];
