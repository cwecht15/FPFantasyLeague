import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { login } from "@/lib/auth/actions";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in — FP Fantasy League" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/leagues");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6">
      <h1 className="display text-4xl">Sign in</h1>
      <AuthForm mode="login" action={login} />
    </main>
  );
}
