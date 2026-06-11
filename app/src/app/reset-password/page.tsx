import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Choose a new password — FP Fantasy League" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token = "", email = "" } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6">
      <h1 className="display text-4xl">New password</h1>
      {!token || !email ? (
        <p className="text-muted">This reset link is incomplete — request a new one.</p>
      ) : (
        <ResetPasswordForm token={token} email={email} />
      )}
    </main>
  );
}
