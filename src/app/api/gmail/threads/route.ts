import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { fetchThreadsForContact } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const contactEmail = req.nextUrl.searchParams.get("email");
  if (!contactEmail) {
    return NextResponse.json(
      { error: "Email parameter required" },
      { status: 400 }
    );
  }

  try {
    const threads = await fetchThreadsForContact(user.id, contactEmail);
    return NextResponse.json(threads);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch threads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
