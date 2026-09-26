import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Button } from '@repo/ui/button';
import { Check, Clock } from 'lucide-react';
import Link from 'next/link';
import { ProTag } from './pro';

export interface ComingSoonFeatureProps {
  /** What it is, as the menu names it. */
  feature: string;
  /** What it will do, one sentence in their words rather than ours. */
  description: string;
  /** The specific things it will do, so somebody can tell whether it is the thing they wanted. */
  willDo: string[];
  /** The plan it lands on. */
  plan?: 'Pro' | 'Free';
}

/**
 * A feature that is on the way and is not here (D-116, D-209).
 *
 * There is no button to buy anything. Selling a plan on the strength of a screen that does not
 * exist is the thing D-116 exists to stop, so this says what is coming, says which plan it will
 * land on, and offers the one useful thing somebody can do about it today, which is tell us it
 * matters to them.
 */
export function ComingSoonFeature({ feature, description, willDo, plan = 'Pro' }: ComingSoonFeatureProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4" role="region" aria-labelledby="coming-title">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-grey-700" aria-hidden />
          <div className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <CardTitle id="coming-title">{feature} is on the way</CardTitle>
              {plan === 'Pro' ? <ProTag /> : null}
            </span>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {willDo.map((one) => (
            <li key={one} className="flex items-start gap-3">
              <Check className="mt-0.5 size-5 shrink-0 text-grey-400" aria-hidden />
              <span className="text-body text-grey-700">{one}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3" role="region" aria-labelledby="say-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="say-title">Want this sooner?</CardTitle>
          <CardDescription>
            Tell us what you would use it for. What people ask for most is what gets built next.
          </CardDescription>
        </div>
        <Button asChild variant="secondary" width="full">
          <Link href="/feedback">Tell us about it</Link>
        </Button>
      </Card>
    </div>
  );
}
