import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, unknown> = {};

  // Check env vars (presence + lengths to detect trailing whitespace/newlines)
  const googleId = process.env.AUTH_GOOGLE_ID ?? "";
  const googleSecret = process.env.AUTH_GOOGLE_SECRET ?? "";
  const authSecret = process.env.AUTH_SECRET ?? "";

  checks.AUTH_GOOGLE_ID = googleId ? `set (len=${googleId.length}, starts=${googleId.slice(0, 10)}, ends='${googleId.slice(-3)}')` : "MISSING";
  checks.AUTH_GOOGLE_SECRET = googleSecret ? `set (len=${googleSecret.length}, ends='${googleSecret.slice(-3)}')` : "MISSING";
  checks.AUTH_SECRET = authSecret ? `set (len=${authSecret.length})` : "MISSING";
  checks.POSTGRES_PRISMA_URL = process.env.POSTGRES_PRISMA_URL ? "set" : "MISSING";
  checks.POSTGRES_URL_NON_POOLING = process.env.POSTGRES_URL_NON_POOLING ? "set" : "MISSING";

  // Check for trailing whitespace or newlines
  checks.googleIdTrailingIssue = googleId !== googleId.trim();
  checks.googleSecretTrailingIssue = googleSecret !== googleSecret.trim();
  checks.authSecretTrailingIssue = authSecret !== authSecret.trim();

  // Test auth initialization
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    checks.authInit = "ok";
    checks.session = session ? "active" : "none";
  } catch (err) {
    checks.authInit = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    checks.authStack = err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined;
  }

  // Check DB connection
  try {
    const userCount = await prisma.user.count();
    checks.database = `connected (${userCount} users)`;
  } catch (err) {
    checks.database = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(checks);
}
