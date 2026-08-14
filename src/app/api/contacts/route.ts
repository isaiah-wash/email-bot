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

  // Lightweight path for bulk operations (select all, tag all) that only need
  // matching contact ids, not the full row with tags/counts included.
  if (req.nextUrl.searchParams.get("idsOnly") === "true") {
    const ids = await prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return NextResponse.json({ ids: ids.map((c) => c.id) });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const offsetParam = req.nextUrl.searchParams.get("offset");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(offsetParam ?? "0", 10) || 0, 0);

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      include: {
        _count: { select: { emailDrafts: true } },
        tags: { include: { tag: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total });
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
