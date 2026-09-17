import { inngest } from '../client';
import { marketplaceRegionOpened } from '../events';
import { tellRegionOpened } from '../regions';

/**
 * The marketplace opened in an area, so everybody waiting there hears so, once (ADM-04, D-117). A
 * retry emails only those not yet told, each under a key of its own.
 */
export const regionOpenedNotices = inngest.createFunction(
  { id: 'region-opened-notices', name: 'Tell the people waiting that their area has opened', triggers: [marketplaceRegionOpened] },
  ({ event }) => tellRegionOpened(event.data.area),
);
