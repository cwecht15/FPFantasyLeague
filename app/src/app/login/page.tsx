import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { login } from "@/lib/auth/actions";
import { AuthForm } from "@/components/auth-form";
import { AuthStage } from "@/components/auth-stage";

export const metadata = { title: "Sign in — FP Fantasy League" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/leagues");

  return (
    <AuthStage title="Sign in" sub="Charting-scored fantasy football">
      <AuthForm mode="login" action={login} />
    </AuthStage>
  );
}
