import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">Reset your password</h1>
        <p className="text-body text-grey-700">Enter your email and we will send you a link to choose a new password.</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
