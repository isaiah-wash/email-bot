import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { sendDraft } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { draftId } = body;

  if (!draftId) {
    return NextResponse.json(
      { error: "draftId is required" },
      { status: 400 }
    );
  }

  const draft = await prisma.emailDraft.findFirst({
    where: { id: draftId },
    include: { contact: true },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.contact.userId !== user.id) {
    return unauthorized();
  }

  if (!draft.contact.email) {
    return NextResponse.json(
      { error: "Contact has no email address" },
      { status: 400 }
    );
  }

  try {
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const sentEmail = await sendDraft(
      user.id,
      draftId,
      draft.contact.email,
      draft.subject,
      draft.body,
      baseUrl,
      draft.campaignContactId
    );

    return NextResponse.json(sentEmail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
