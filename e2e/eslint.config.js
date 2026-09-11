import { base } from '@repo/config/eslint/base';

export default [...base(import.meta.dirname), { ignores: ['screenshots/**', 'test-results/**', 'playwright-report/**'] }];
