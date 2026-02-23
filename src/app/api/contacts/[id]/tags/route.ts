import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id: contactId } = await params;
  const body = await req.json();

  // Verify contact belongs to user
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId: user.id },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  let tagId: string;

  if (body.tagId) {
    // Adding an existing tag
    const tag = await prisma.tag.findFirst({
      where: { id: body.tagId, userId: user.id },
    });
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
    tagId = tag.id;
  } else if (body.name) {
    // Create new tag and add to contact
    try {
      const tag = await prisma.tag.create({
        data: {
          userId: user.id,
          name: body.name.trim(),
          color: body.color || "#6366f1",
        },
      });
      tagId = tag.id;
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "A tag with this name already exists" },
          { status: 409 }
        );
      }
      throw e;
    }
  } else {
    return NextResponse.json(
      { error: "Provide tagId or name" },
      { status: 400 }
    );
  }

  // Upsert contact-tag association
  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId } },
    create: { contactId, tagId },
    update: {},
  });

  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    include: { _count: { select: { contacts: true } } },
  });

  return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id: contactId } = await params;
  const { tagId } = await req.json();

  // Verify contact belongs to user
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId: user.id },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await prisma.contactTag.deleteMany({
    where: { contactId, tagId },
  });

  return NextResponse.json({ success: true });
}
