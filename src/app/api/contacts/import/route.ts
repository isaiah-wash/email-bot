import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

interface CsvContact {
  firstName: string;
  lastName: string;
  email: string;
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  let body: { contacts: CsvContact[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contacts } = body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json(
      { error: "No contacts provided" },
      { status: 400 }
    );
  }

  if (contacts.length > 5000) {
    return NextResponse.json(
      { error: "Maximum 5000 contacts per import" },
      { status: 400 }
    );
  }

  // Validate and normalize
  const valid: { email: string; firstName: string | null; lastName: string | null }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const email = (c.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      errors.push(`Row ${i + 1}: invalid or missing email "${c.email ?? ""}"`);
      continue;
    }

    valid.push({
      email,
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

  // Use createMany with skipDuplicates to handle existing contacts gracefully
  const result = await prisma.contact.createMany({
    data: valid.map((c) => ({
      userId: user.id,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    imported: result.count,
    skipped: valid.length - result.count,
    errors,
  });
}
