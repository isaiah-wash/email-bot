const PROXYCURL_BASE = "https://nubela.co/proxycurl/api/v2";

export interface LinkedInProfile {
  public_identifier: string;
  first_name: string;
  last_name: string;
  full_name: string;
  headline: string;
  summary: string;
  country: string;
  city: string;
  experiences: {
    title: string;
    company: string;
    description: string;
    starts_at: { day: number; month: number; year: number } | null;
    ends_at: { day: number; month: number; year: number } | null;
  }[];
  education: {
    school: string;
    degree_name: string;
    field_of_study: string;
    starts_at: { day: number; month: number; year: number } | null;
    ends_at: { day: number; month: number; year: number } | null;
  }[];
  personal_emails: string[];
  work_email: string | null;
  [key: string]: unknown;
}

function normalizeLinkedInUrl(url: string): string {
  let cleaned = url.trim();
  if (!cleaned.startsWith("http")) {
    cleaned = "https://" + cleaned;
  }
  // Remove trailing slash
  cleaned = cleaned.replace(/\/$/, "");
  // Ensure it's a linkedin.com URL
  if (!cleaned.includes("linkedin.com/in/")) {
    throw new Error("Invalid LinkedIn profile URL");
  }
  return cleaned;
}

export async function enrichFromLinkedIn(
  linkedinUrl: string
): Promise<LinkedInProfile> {
  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) {
    throw new Error("PROXYCURL_API_KEY is not configured");
  }

  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);

  const response = await fetch(
    `${PROXYCURL_BASE}/linkedin?url=${encodeURIComponent(normalizedUrl)}&use_cache=if-present`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Proxycurl API error (${response.status}): ${error}`);
  }

  return response.json();
}

export function extractEmailFromProfile(
  profile: LinkedInProfile
): string | null {
  if (profile.work_email) return profile.work_email;
  if (profile.personal_emails?.length > 0) return profile.personal_emails[0];
  return null;
}

export function extractCompanyFromProfile(
  profile: LinkedInProfile
): string | null {
  const current = profile.experiences?.find((exp) => !exp.ends_at);
  return current?.company ?? profile.experiences?.[0]?.company ?? null;
}

export function extractTitleFromProfile(
  profile: LinkedInProfile
): string | null {
  const current = profile.experiences?.find((exp) => !exp.ends_at);
  return current?.title ?? profile.experiences?.[0]?.title ?? null;
}
