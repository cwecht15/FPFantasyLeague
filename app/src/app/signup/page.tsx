import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signup } from "@/lib/auth/actions";
import { AuthForm } from "@/components/auth-form";
import { AuthStage } from "@/components/auth-stage";

export const metadata = { title: "Create account — FP Fantasy League" };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/leagues");

  return (
    <AuthStage title="Create account" sub="Join your league with an invite code after signup">
      <AuthForm mode="signup" action={signup} />
    </AuthStage>
  );
}
