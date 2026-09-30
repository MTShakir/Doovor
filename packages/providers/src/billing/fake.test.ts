import { billingContract } from './contract.ts';
import { createFakeBillingProvider } from './fake.ts';

billingContract('the billing provider that takes no money', createFakeBillingProvider);
