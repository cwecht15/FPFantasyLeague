import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { login } from "@/lib/auth/actions";
import { AuthForm } from "@/components/auth-form";
import { AuthStage } from "@/components/auth-stage";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/leagues");

  return (
    <AuthStage title="Sign in" sub="Charting-scored fantasy football">
      <AuthForm mode="login" action={login} next={next} />
    </AuthStage>
  );
}
