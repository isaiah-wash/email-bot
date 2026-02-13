import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, string> = {};

  // Check env vars (just presence, not values)
  checks.AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID ? `set (${process.env.AUTH_GOOGLE_ID.slice(0, 10)}...)` : "MISSING";
  checks.AUTH_GOOGLE_SECRET = process.env.AUTH_GOOGLE_SECRET ? "set" : "MISSING";
  checks.AUTH_SECRET = process.env.AUTH_SECRET ? "set" : "MISSING";
  checks.POSTGRES_PRISMA_URL = process.env.POSTGRES_PRISMA_URL ? "set" : "MISSING";
  checks.POSTGRES_URL_NON_POOLING = process.env.POSTGRES_URL_NON_POOLING ? "set" : "MISSING";

  // Check DB connection
  try {
    const userCount = await prisma.user.count();
    checks.database = `connected (${userCount} users)`;
  } catch (err) {
    checks.database = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(checks);
}
