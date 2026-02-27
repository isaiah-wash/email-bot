import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const search = req.nextUrl.searchParams.get("search") ?? "";
  const enriched = req.nextUrl.searchParams.get("enriched");
  const tagIdParam = req.nextUrl.searchParams.get("tagId");
  const untagged = req.nextUrl.searchParams.get("untagged");

  const where: Record<string, unknown> = { userId: user.id };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
    ];
  }

  if (enriched === "true") {
    where.enrichedAt = { not: null };
  } else if (enriched === "false") {
    where.enrichedAt = null;
  }

  if (untagged === "true") {
    where.tags = { none: {} };
  } else if (tagIdParam) {
    const tagIds = tagIdParam.split(",").filter(Boolean);
    if (tagIds.length > 0) {
      where.tags = { some: { tagId: { in: tagIds } } };
    }
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { emailDrafts: true } },
      tags: { include: { tag: true } },
    },
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { email, linkedinUrl, firstName, lastName } = body;

  if (!email && !linkedinUrl) {
    return NextResponse.json(
      { error: "At least one of email or LinkedIn URL must be provided" },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.create({
    data: {
      userId: user.id,
      email: email || null,
      linkedinUrl: linkedinUrl || null,
      firstName: firstName || null,
      lastName: lastName || null,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
