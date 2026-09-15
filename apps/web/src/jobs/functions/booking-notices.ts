import { inngest } from '../client';
import {
  bookingAccepted,
  bookingCancelled,
  bookingCompleted,
  bookingCreated,
  bookingDeclined,
  bookingDisputeDecided,
  bookingDisputed,
  bookingNoShow,
  bookingRescheduled,
  paymentChargeFailed,
} from '../events';
import { notifyAboutBooking } from '../notify';

/**
 * Everybody a lesson concerns hears what happened to it (NTF-03, PRD Appendix B, M2-27).
 *
 * One function for every change to a booking: the same people are involved either way, and
 * what differs is only the words. A retry is safe, because each notification carries a key
 * unique to the person, the lesson and the version of it.
 */
export const bookingNotices = inngest.createFunction(
  {
    id: 'booking-notices',
    name: 'Notify about a lesson',
    triggers: [
      bookingCreated,
      bookingAccepted,
      bookingDeclined,
      bookingCancelled,
      bookingNoShow,
      bookingDisputed,
      bookingDisputeDecided,
      bookingRescheduled,
      bookingCompleted,
      paymentChargeFailed,
    ],
  },
  ({ event }) => notifyAboutBooking({ name: event.name, payload: event.data }),
);
