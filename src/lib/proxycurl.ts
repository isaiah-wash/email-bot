const SCRAPIN_BASE = "https://api.scrapin.io/v1/enrichment";

export interface LinkedInProfile {
  publicIdentifier: string;
  firstName: string;
  lastName: string;
  headline: string;
  summary: string | null;
  location: {
    city: string;
    state: string;
    country: string;
    countryCode: string;
  } | null;
  currentPosition: {
    title: string;
    companyName: string;
    description: string;
    startEndDate: {
      start: { month: number; year: number } | null;
      end: { month: number; year: number } | null;
    } | null;
  } | null;
  positions: {
    positionsCount: number;
    positionHistory: {
      title: string;
      companyName: string;
      description: string;
      startEndDate: {
        start: { month: number; year: number } | null;
        end: { month: number; year: number } | null;
      } | null;
    }[];
  } | null;
  [key: string]: unknown;
}

function normalizeLinkedInUrl(url: string): string {
  let cleaned = url.trim();
  if (!cleaned.startsWith("http")) {
    cleaned = "https://" + cleaned;
  }
  cleaned = cleaned.replace(/\/$/, "");
  if (!cleaned.includes("linkedin.com/in/")) {
    throw new Error("Invalid LinkedIn profile URL");
  }
  return cleaned;
}

export async function enrichFromLinkedIn(
  linkedinUrl: string
): Promise<LinkedInProfile> {
  const apiKey = process.env.SCRAPIN_API_KEY;
  if (!apiKey) {
    throw new Error("SCRAPIN_API_KEY is not configured — add it to .env.local");
  }

  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);

  const response = await fetch(`${SCRAPIN_BASE}/profile`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      linkedInUrl: normalizedUrl,
      includes: {
        includeCompany: true,
        includeExperience: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ScrapIn API error (${response.status}): ${error}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.msg || "ScrapIn enrichment failed");
  }

  return data.person;
}

export function extractEmailFromProfile(
  _profile: LinkedInProfile
): string | null {
  // ScrapIn profile endpoint does not return email
  return null;
}

export function extractCompanyFromProfile(
  profile: LinkedInProfile
): string | null {
  if (profile.currentPosition?.companyName) {
    return profile.currentPosition.companyName;
  }
  const first = profile.positions?.positionHistory?.[0];
  return first?.companyName ?? null;
}

export function extractTitleFromProfile(
  profile: LinkedInProfile
): string | null {
  if (profile.currentPosition?.title) {
    return profile.currentPosition.title;
  }
  const first = profile.positions?.positionHistory?.[0];
  return first?.title ?? null;
}
