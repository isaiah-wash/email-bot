import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id: tagId } = await params;
  const { contactIds } = await req.json();

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "contactIds is required" }, { status: 400 });
  }

  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId: user.id } });
  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  const ownedContacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, userId: user.id },
    select: { id: true },
  });

  const result = await prisma.contactTag.createMany({
    data: ownedContacts.map((c) => ({ contactId: c.id, tagId })),
    skipDuplicates: true,
  });

  return NextResponse.json({ applied: result.count });
}
