import { AuthStage } from "@/components/auth-stage";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token = "", email = "" } = await searchParams;

  return (
    <AuthStage title="New password">
      {!token || !email ? (
        <p className="lsub">This reset link is incomplete — request a new one.</p>
      ) : (
        <ResetPasswordForm token={token} email={email} />
      )}
    </AuthStage>
  );
}
