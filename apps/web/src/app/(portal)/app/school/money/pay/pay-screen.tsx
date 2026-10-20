'use client';

import { useRouter } from 'next/navigation';
import { PayWeekView } from '@/components/school/pay-week';
import type { PayWeek } from '@/lib/school/pay';
import { saveMemberPay } from './actions';

/** The school's week of pay, with its own way to change what each instructor is paid (D-291). */
export function PayScreen({ week }: { week: PayWeek }) {
  const router = useRouter();
  return (
    <PayWeekView
      week={week}
      base="/app/school/money/pay"
      csvHref={`/app/school/money/pay/download?week=${week.weekStart}`}
      handlers={{ savePay: saveMemberPay, refresh: () => { router.refresh(); } }}
    />
  );
}
