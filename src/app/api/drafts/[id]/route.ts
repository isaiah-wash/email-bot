import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const draft = await prisma.emailDraft.findFirst({
    where: { id, contact: { userId: user.id } },
    include: {
      contact: true,
      sentEmail: true,
      campaignContact: { include: { campaign: true } },
    },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  return NextResponse.json(draft);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.emailDraft.findFirst({
    where: { id, contact: { userId: user.id } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (existing.status === "SENT") {
    return NextResponse.json(
      { error: "Cannot edit a sent email" },
      { status: 400 }
    );
  }

  const draft = await prisma.emailDraft.update({
    where: { id },
    data: {
      ...(body.subject !== undefined && { subject: body.subject }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.status !== undefined && { status: body.status }),
    },
    include: { contact: true },
  });

  // Update campaign contact status if approving
  if (body.status === "APPROVED" && draft.campaignContactId) {
    await prisma.campaignContact.update({
      where: { id: draft.campaignContactId },
      data: { status: "APPROVED" },
    });
  }

  return NextResponse.json(draft);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await prisma.emailDraft.findFirst({
    where: { id, contact: { userId: user.id } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  await prisma.emailDraft.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
