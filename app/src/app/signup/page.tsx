import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthStage } from "@/components/auth-stage";
import { SITE_NAME, SITE_URL } from "@/lib/brand";

export const metadata = { title: "Join with your invite" };

/**
 * Invite gate. Accounts are only useful inside a league, and leagues are
 * invite-only (product rule 1), so a bare signup just strands people on the
 * "enter an invite code" screen — which is exactly what happened on launch
 * day. Instead, this page routes an invite link or code to /join/<code>, where
 * the account, team, and membership are created in one step.
 */
export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/leagues");

  async function goToInvite(formData: FormData) {
    "use server";
    // Accept the full link, a trailing-slash link, or the bare code.
    const raw = String(formData.get("code") ?? "").trim();
    const code = (raw.split(/[/\s?#]+/).filter(Boolean).pop() ?? "").toLowerCase();
    redirect(code ? `/join/${encodeURIComponent(code)}` : "/signup");
  }

  return (
    <AuthStage title="Join with your invite" sub="Your account is created from your invite link">
      <p className="text-[13px] text-muted">
        Open the email from {SITE_NAME} and click its <strong>Join</strong> link — that sets up
        your username, password, and team in one step. Or paste the link (or the code at the
        end of it) here:
      </p>
      <form action={goToInvite} className="mt-4">
        <div className="field">
          <label>Invite link or code</label>
          <input
            name="code"
            required
            className="input code"
            placeholder={`${SITE_URL}/join/…`}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
        <button type="submit" className="btn pri" style={{ width: "100%" }}>
          <span>Continue</span>
        </button>
      </form>
      <p className="mt-4 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="linkish">
          Sign in
        </Link>
      </p>
    </AuthStage>
  );
}
