import Image from "next/image";
import { SITE_NAME } from "@/lib/brand";

/** Game Day auth stage: smoke background, flame-topped card, tagline below. */
export function AuthStage({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="login-stage smoke">
      <div>
        <div className="login-card">
          <Image
            src="/brand/Wordmark-Primary.svg"
            alt={SITE_NAME}
            width={120}
            height={22}
            style={{ height: 22, width: "auto", display: "block", margin: "0 auto 26px" }}
            priority
          />
          <h1 className="display">{title}</h1>
          {sub && <div className="lsub">{sub}</div>}
          {children}
        </div>
        <p className="mt-5 text-center text-[11.5px] font-extrabold uppercase tracking-[0.18em] text-faint">
          Box scores lie. The film doesn&apos;t.
        </p>
      </div>
    </main>
  );
}
