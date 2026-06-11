import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signup } from "@/lib/auth/actions";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create account — FP Fantasy League" };

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/leagues");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6">
      <h1 className="display text-4xl">Create account</h1>
      <AuthForm mode="signup" action={signup} />
    </main>
  );
}
