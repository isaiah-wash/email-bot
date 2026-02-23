import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

interface CsvContact {
  firstName: string;
  lastName: string;
  email: string;
  linkedinUrl: string;
}

interface ValidContact {
  email: string | null;
  linkedinUrl: string | null;
  firstName: string | null;
  lastName: string | null;
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  let body: { contacts: CsvContact[]; resolutions?: Record<string, "update" | "create"> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contacts, resolutions } = body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
  }

  if (contacts.length > 5000) {
    return NextResponse.json(
      { error: "Maximum 5000 contacts per import" },
      { status: 400 }
    );
  }

  // Validate, normalize, and deduplicate by email (keep first occurrence)
  const valid: ValidContact[] = [];
  const errors: string[] = [];
  const seenEmails = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const email = (c.email ?? "").trim().toLowerCase() || null;
    const linkedinUrl = (c.linkedinUrl ?? "").trim() || null;

    if ((!email || !email.includes("@")) && !linkedinUrl) {
      errors.push(`Row ${i + 1}: must have a valid email or LinkedIn URL`);
      continue;
    }

    const normalizedEmail = email && email.includes("@") ? email : null;

    // Deduplicate within CSV — keep first occurrence of each email
    if (normalizedEmail && seenEmails.has(normalizedEmail)) {
      errors.push(`Row ${i + 1}: duplicate email in CSV (${normalizedEmail}) — skipped`);
      continue;
    }
    if (normalizedEmail) seenEmails.add(normalizedEmail);

    valid.push({
      email: normalizedEmail,
      linkedinUrl,
      firstName: (c.firstName ?? "").trim() || null,
      lastName: (c.lastName ?? "").trim() || null,
    });
  }

  if (valid.length === 0) {
    return NextResponse.json(
      { error: "No valid contacts found", details: errors },
      { status: 400 }
    );
  }

  // Phase 1 — no resolutions provided: check for duplicates first
  if (!resolutions) {
    const emailsInCsv = valid.filter((c) => c.email).map((c) => c.email as string);

    const existingContacts =
      emailsInCsv.length > 0
        ? await prisma.contact.findMany({
            where: { userId: user.id, email: { in: emailsInCsv } },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              company: true,
              title: true,
            },
          })
        : [];

    if (existingContacts.length > 0) {
      const existingByEmail = new Map(existingContacts.map((c) => [c.email, c]));
      const duplicates = valid
        .filter((c) => c.email && existingByEmail.has(c.email))
        .map((c) => ({
          csvContact: c,
          existingContact: existingByEmail.get(c.email!)!,
        }));

      return NextResponse.json({ requiresResolution: true, duplicates, errors });
    }
  }

  // Phase 2 — process with resolutions (or no duplicates path)
  let imported = 0;
  let skipped = 0;

  if (resolutions) {
    // Split contacts into three buckets
    const toCreate = valid.filter((c) => !c.email || !resolutions[c.email]);
    const toUpdate = valid.filter((c) => c.email && resolutions[c.email] === "update");
    const toCreateDuplicate = valid.filter(
      (c) => c.email && resolutions[c.email] === "create"
    );

    // Batch-create non-duplicates
    const batchResult = await prisma.contact.createMany({
      data: toCreate.map((c) => ({
        userId: user.id,
        email: c.email,
        linkedinUrl: c.linkedinUrl,
        firstName: c.firstName,
        lastName: c.lastName,
      })),
      skipDuplicates: true,
    });
    imported += batchResult.count;
    skipped += toCreate.length - batchResult.count;

    // Update existing contacts (replace with CSV data)
    for (const c of toUpdate) {
      await prisma.contact.updateMany({
        where: { userId: user.id, email: c.email! },
        data: {
          ...(c.firstName !== null ? { firstName: c.firstName } : {}),
          ...(c.lastName !== null ? { lastName: c.lastName } : {}),
          ...(c.linkedinUrl !== null ? { linkedinUrl: c.linkedinUrl } : {}),
        },
      });
      imported++;
    }

    // Create new contacts even though email already exists
    for (const c of toCreateDuplicate) {
      try {
        await prisma.contact.create({
          data: {
            userId: user.id,
            email: c.email,
            linkedinUrl: c.linkedinUrl,
            firstName: c.firstName,
            lastName: c.lastName,
          },
        });
        imported++;
      } catch {
        skipped++;
      }
    }
  } else {
    // No duplicates — batch create everything
    const result = await prisma.contact.createMany({
      data: valid.map((c) => ({
        userId: user.id,
        email: c.email,
        linkedinUrl: c.linkedinUrl,
        firstName: c.firstName,
        lastName: c.lastName,
      })),
      skipDuplicates: true,
    });
    imported = result.count;
    skipped = valid.length - result.count;
  }

  return NextResponse.json({ imported, skipped, errors });
}
