import { prisma } from "@/lib/prisma";
import {
  enrichFromLinkedIn,
  extractCompanyFromProfile,
  extractTitleFromProfile,
} from "@/lib/proxycurl";
import { generateEmailDraft } from "@/lib/claude";
import { fetchThreadsForContact, sendEmail } from "@/lib/gmail";
import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;

export const CHAT_TOOLS: Tool[] = [
  // ── Contacts ──
  {
    name: "list_contacts",
    description:
      "List contacts in the user's directory. Optionally filter by search query or enrichment status.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: {
          type: "string",
          description:
            "Search by name, email, or company (optional)",
        },
        enriched: {
          type: "boolean",
          description: "Filter by enrichment status (optional)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_contact",
    description:
      "Get full details of a single contact including drafts and campaigns.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "The contact ID" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "create_contact",
    description:
      "Create a new contact. At least one of email or linkedinUrl must be provided.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Email address" },
        linkedinUrl: { type: "string", description: "LinkedIn profile URL" },
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
      },
      required: [],
    },
  },
  {
    name: "update_contact",
    description: "Update a contact's information.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "The contact ID" },
        email: { type: "string", description: "New email address" },
        linkedinUrl: { type: "string", description: "New LinkedIn URL" },
        firstName: { type: "string", description: "New first name" },
        lastName: { type: "string", description: "New last name" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "delete_contact",
    description: "Delete a contact and all associated data.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "The contact ID" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "enrich_contact",
    description:
      "Enrich a contact from their LinkedIn profile. Fills in company, title, and other details.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "The contact ID" },
      },
      required: ["contactId"],
    },
  },

  // ── Templates ──
  {
    name: "list_templates",
    description: "List all email templates.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_template",
    description: "Create a new email template.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Template name" },
        subjectTemplate: {
          type: "string",
          description: "Email subject line template",
        },
        bodyInstructions: {
          type: "string",
          description:
            "Instructions for generating the email body. Describe the tone, content, and goals.",
        },
      },
      required: ["name", "subjectTemplate", "bodyInstructions"],
    },
  },
  {
    name: "update_template",
    description: "Update an existing email template.",
    input_schema: {
      type: "object" as const,
      properties: {
        templateId: { type: "string", description: "The template ID" },
        name: { type: "string", description: "New template name" },
        subjectTemplate: { type: "string", description: "New subject template" },
        bodyInstructions: {
          type: "string",
          description: "New body instructions",
        },
      },
      required: ["templateId"],
    },
  },
  {
    name: "delete_template",
    description: "Delete an email template.",
    input_schema: {
      type: "object" as const,
      properties: {
        templateId: { type: "string", description: "The template ID" },
      },
      required: ["templateId"],
    },
  },

  // ── Campaigns ──
  {
    name: "list_campaigns",
    description: "List all campaigns with their status and contact counts.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_campaign",
    description:
      "Create a new email campaign. Optionally assign a template and contacts.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Campaign name" },
        description: { type: "string", description: "Campaign description" },
        context: {
          type: "string",
          description:
            "Additional context for AI email generation (e.g. product info, goals)",
        },
        templateId: {
          type: "string",
          description: "Template ID to use for this campaign",
        },
        contactIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of contact IDs to add to the campaign",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_campaign",
    description:
      "Get full details of a campaign including contacts and their draft statuses.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignId: { type: "string", description: "The campaign ID" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "update_campaign",
    description:
      "Update a campaign. Can change name, description, context, template, status, and add/remove contacts.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignId: { type: "string", description: "The campaign ID" },
        name: { type: "string", description: "New campaign name" },
        description: { type: "string", description: "New description" },
        context: { type: "string", description: "New AI generation context" },
        templateId: { type: "string", description: "New template ID" },
        status: {
          type: "string",
          enum: ["DRAFT", "ACTIVE", "COMPLETED"],
          description: "New campaign status",
        },
        addContactIds: {
          type: "array",
          items: { type: "string" },
          description: "Contact IDs to add to the campaign",
        },
        removeContactIds: {
          type: "array",
          items: { type: "string" },
          description: "Contact IDs to remove from the campaign",
        },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "delete_campaign",
    description: "Delete a campaign.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignId: { type: "string", description: "The campaign ID" },
      },
      required: ["campaignId"],
    },
  },
  {
    name: "generate_campaign_drafts",
    description:
      "Generate email drafts for all pending contacts in a campaign using the campaign's template.",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignId: { type: "string", description: "The campaign ID" },
      },
      required: ["campaignId"],
    },
  },

  // ── Drafts ──
  {
    name: "list_drafts",
    description: "List email drafts. Optionally filter by contact or status.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "Filter by contact ID" },
        status: {
          type: "string",
          enum: ["GENERATED", "EDITED", "APPROVED", "SENT"],
          description: "Filter by draft status",
        },
      },
      required: [],
    },
  },
  {
    name: "get_draft",
    description: "Get full details of an email draft including its content.",
    input_schema: {
      type: "object" as const,
      properties: {
        draftId: { type: "string", description: "The draft ID" },
      },
      required: ["draftId"],
    },
  },
  {
    name: "update_draft",
    description:
      "Update a draft's subject, body, or status. Use status APPROVED to approve a draft for sending.",
    input_schema: {
      type: "object" as const,
      properties: {
        draftId: { type: "string", description: "The draft ID" },
        subject: { type: "string", description: "New subject line" },
        body: { type: "string", description: "New email body (HTML)" },
        status: {
          type: "string",
          enum: ["GENERATED", "EDITED", "APPROVED"],
          description: "New status",
        },
      },
      required: ["draftId"],
    },
  },
  {
    name: "delete_draft",
    description: "Delete an email draft.",
    input_schema: {
      type: "object" as const,
      properties: {
        draftId: { type: "string", description: "The draft ID" },
      },
      required: ["draftId"],
    },
  },

  // ── Email ──
  {
    name: "send_email",
    description:
      "Send an approved email draft via Gmail. The draft must have status APPROVED and the contact must have an email.",
    input_schema: {
      type: "object" as const,
      properties: {
        draftId: { type: "string", description: "The draft ID to send" },
      },
      required: ["draftId"],
    },
  },
  {
    name: "get_email_threads",
    description:
      "Fetch Gmail email threads for a specific contact email address.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactEmail: {
          type: "string",
          description: "The contact's email address to search threads for",
        },
      },
      required: ["contactEmail"],
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (name) {
      // ── Contacts ──
      case "list_contacts": {
        const where: Record<string, unknown> = { userId };
        if (input.search) {
          where.OR = [
            { firstName: { contains: input.search, mode: "insensitive" } },
            { lastName: { contains: input.search, mode: "insensitive" } },
            { email: { contains: input.search, mode: "insensitive" } },
            { company: { contains: input.search, mode: "insensitive" } },
          ];
        }
        if (input.enriched === true) where.enrichedAt = { not: null };
        else if (input.enriched === false) where.enrichedAt = null;

        const contacts = await prisma.contact.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            company: true,
            title: true,
            linkedinUrl: true,
            enrichedAt: true,
            _count: { select: { emailDrafts: true } },
          },
        });
        return JSON.stringify({ contacts, total: contacts.length });
      }

      case "get_contact": {
        const contact = await prisma.contact.findFirst({
          where: { id: input.contactId as string, userId },
          include: {
            emailDrafts: {
              orderBy: { createdAt: "desc" },
              take: 10,
              include: { sentEmail: true },
            },
            campaignContacts: { include: { campaign: true } },
          },
        });
        if (!contact) return JSON.stringify({ error: "Contact not found" });
        return JSON.stringify(contact);
      }

      case "create_contact": {
        if (!input.email && !input.linkedinUrl) {
          return JSON.stringify({
            error: "At least one of email or linkedinUrl is required",
          });
        }
        const contact = await prisma.contact.create({
          data: {
            userId,
            email: (input.email as string) || null,
            linkedinUrl: (input.linkedinUrl as string) || null,
            firstName: (input.firstName as string) || null,
            lastName: (input.lastName as string) || null,
          },
        });
        return JSON.stringify(contact);
      }

      case "update_contact": {
        const existing = await prisma.contact.findFirst({
          where: { id: input.contactId as string, userId },
        });
        if (!existing) return JSON.stringify({ error: "Contact not found" });

        const contact = await prisma.contact.update({
          where: { id: input.contactId as string },
          data: {
            ...(input.email !== undefined && {
              email: (input.email as string) || null,
            }),
            ...(input.linkedinUrl !== undefined && {
              linkedinUrl: (input.linkedinUrl as string) || null,
            }),
            ...(input.firstName !== undefined && {
              firstName: (input.firstName as string) || null,
            }),
            ...(input.lastName !== undefined && {
              lastName: (input.lastName as string) || null,
            }),
          },
        });
        return JSON.stringify(contact);
      }

      case "delete_contact": {
        const existing = await prisma.contact.findFirst({
          where: { id: input.contactId as string, userId },
        });
        if (!existing) return JSON.stringify({ error: "Contact not found" });
        await prisma.contact.delete({
          where: { id: input.contactId as string },
        });
        return JSON.stringify({ success: true });
      }

      case "enrich_contact": {
        const contact = await prisma.contact.findFirst({
          where: { id: input.contactId as string, userId },
        });
        if (!contact) return JSON.stringify({ error: "Contact not found" });
        if (!contact.linkedinUrl) {
          return JSON.stringify({
            error: "Contact has no LinkedIn URL to enrich from",
          });
        }

        const profile = await enrichFromLinkedIn(contact.linkedinUrl);
        const updateData: Record<string, unknown> = {
          linkedinData: profile as unknown as Record<string, unknown>,
          enrichedAt: new Date(),
        };
        if (!contact.firstName && profile.firstName)
          updateData.firstName = profile.firstName;
        if (!contact.lastName && profile.lastName)
          updateData.lastName = profile.lastName;

        const company = extractCompanyFromProfile(profile);
        if (company) updateData.company = company;
        const title = extractTitleFromProfile(profile);
        if (title) updateData.title = title;

        const updated = await prisma.contact.update({
          where: { id: input.contactId as string },
          data: updateData,
        });
        return JSON.stringify(updated);
      }

      // ── Templates ──
      case "list_templates": {
        const templates = await prisma.template.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            subjectTemplate: true,
            bodyInstructions: true,
            createdAt: true,
            _count: { select: { campaigns: true } },
          },
        });
        return JSON.stringify({ templates, total: templates.length });
      }

      case "create_template": {
        if (!input.name || !input.subjectTemplate || !input.bodyInstructions) {
          return JSON.stringify({
            error:
              "name, subjectTemplate, and bodyInstructions are all required",
          });
        }
        const template = await prisma.template.create({
          data: {
            userId,
            name: input.name as string,
            subjectTemplate: input.subjectTemplate as string,
            bodyInstructions: input.bodyInstructions as string,
          },
        });
        return JSON.stringify(template);
      }

      case "update_template": {
        const existing = await prisma.template.findFirst({
          where: { id: input.templateId as string, userId },
        });
        if (!existing) return JSON.stringify({ error: "Template not found" });

        const template = await prisma.template.update({
          where: { id: input.templateId as string },
          data: {
            ...(input.name !== undefined && { name: input.name as string }),
            ...(input.subjectTemplate !== undefined && {
              subjectTemplate: input.subjectTemplate as string,
            }),
            ...(input.bodyInstructions !== undefined && {
              bodyInstructions: input.bodyInstructions as string,
            }),
          },
        });
        return JSON.stringify(template);
      }

      case "delete_template": {
        const existing = await prisma.template.findFirst({
          where: { id: input.templateId as string, userId },
        });
        if (!existing) return JSON.stringify({ error: "Template not found" });
        await prisma.template.delete({
          where: { id: input.templateId as string },
        });
        return JSON.stringify({ success: true });
      }

      // ── Campaigns ──
      case "list_campaigns": {
        const campaigns = await prisma.campaign.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            templateId: true,
            createdAt: true,
            _count: { select: { contacts: true } },
          },
        });
        return JSON.stringify({ campaigns, total: campaigns.length });
      }

      case "create_campaign": {
        if (!input.name) {
          return JSON.stringify({ error: "Campaign name is required" });
        }
        const campaign = await prisma.campaign.create({
          data: {
            userId,
            name: input.name as string,
            description: (input.description as string) || null,
            context: (input.context as string) || null,
            templateId: (input.templateId as string) || null,
            contacts: (input.contactIds as string[])?.length
              ? {
                  create: (input.contactIds as string[]).map(
                    (contactId) => ({ contactId })
                  ),
                }
              : undefined,
          },
          include: {
            template: true,
            _count: { select: { contacts: true } },
          },
        });
        return JSON.stringify(campaign);
      }

      case "get_campaign": {
        const campaign = await prisma.campaign.findFirst({
          where: { id: input.campaignId as string, userId },
          include: {
            template: true,
            contacts: {
              include: {
                contact: true,
                drafts: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  include: { sentEmail: true },
                },
              },
            },
          },
        });
        if (!campaign) return JSON.stringify({ error: "Campaign not found" });
        return JSON.stringify(campaign);
      }

      case "update_campaign": {
        const existing = await prisma.campaign.findFirst({
          where: { id: input.campaignId as string, userId },
        });
        if (!existing) return JSON.stringify({ error: "Campaign not found" });

        if ((input.addContactIds as string[])?.length) {
          await prisma.campaignContact.createMany({
            data: (input.addContactIds as string[]).map((contactId) => ({
              campaignId: input.campaignId as string,
              contactId,
            })),
            skipDuplicates: true,
          });
        }
        if ((input.removeContactIds as string[])?.length) {
          await prisma.campaignContact.deleteMany({
            where: {
              campaignId: input.campaignId as string,
              contactId: { in: input.removeContactIds as string[] },
            },
          });
        }

        const campaign = await prisma.campaign.update({
          where: { id: input.campaignId as string },
          data: {
            ...(input.name !== undefined && { name: input.name as string }),
            ...(input.description !== undefined && {
              description: input.description as string,
            }),
            ...(input.context !== undefined && {
              context: input.context as string,
            }),
            ...(input.templateId !== undefined && {
              templateId: input.templateId as string,
            }),
            ...(input.status !== undefined && {
              status: input.status as "DRAFT" | "ACTIVE" | "COMPLETED",
            }),
          },
          include: {
            template: true,
            _count: { select: { contacts: true } },
          },
        });
        return JSON.stringify(campaign);
      }

      case "delete_campaign": {
        const existing = await prisma.campaign.findFirst({
          where: { id: input.campaignId as string, userId },
        });
        if (!existing) return JSON.stringify({ error: "Campaign not found" });
        await prisma.campaign.delete({
          where: { id: input.campaignId as string },
        });
        return JSON.stringify({ success: true });
      }

      case "generate_campaign_drafts": {
        const campaign = await prisma.campaign.findFirst({
          where: { id: input.campaignId as string, userId },
          include: {
            template: true,
            contacts: {
              where: { status: "PENDING" },
              include: { contact: true },
            },
          },
        });
        if (!campaign) return JSON.stringify({ error: "Campaign not found" });
        if (!campaign.template) {
          return JSON.stringify({
            error: "Campaign has no template assigned",
          });
        }
        if (campaign.contacts.length === 0) {
          return JSON.stringify({
            error: "No pending contacts in this campaign",
          });
        }

        const results: {
          contactId: string;
          success: boolean;
          error?: string;
        }[] = [];

        for (const cc of campaign.contacts) {
          try {
            let emailHistory: {
              from: string;
              subject: string;
              body: string;
              date: string;
            }[] = [];
            if (cc.contact.email) {
              try {
                const threads = await fetchThreadsForContact(
                  userId,
                  cc.contact.email,
                  3
                );
                emailHistory = threads.flatMap((t) =>
                  t.messages.map((m) => ({
                    from: m.from,
                    subject: m.subject,
                    body: m.body,
                    date: m.date,
                  }))
                );
              } catch {
                // Continue without email history
              }
            }

            const generated = await generateEmailDraft({
              contactName:
                [cc.contact.firstName, cc.contact.lastName]
                  .filter(Boolean)
                  .join(" ") ||
                cc.contact.email ||
                "Contact",
              contactEmail: cc.contact.email ?? undefined,
              contactCompany: cc.contact.company ?? undefined,
              contactTitle: cc.contact.title ?? undefined,
              linkedinData:
                (cc.contact.linkedinData as Record<string, unknown>) ??
                undefined,
              emailHistory,
              templateSubject: campaign.template.subjectTemplate,
              templateInstructions: campaign.template.bodyInstructions,
              campaignContext: campaign.context ?? undefined,
            });

            await prisma.emailDraft.create({
              data: {
                contactId: cc.contactId,
                campaignContactId: cc.id,
                subject: generated.subject,
                body: generated.body,
                generationContext: {
                  templateId: campaign.templateId,
                  campaignId: campaign.id,
                },
                status: "GENERATED",
              },
            });

            await prisma.campaignContact.update({
              where: { id: cc.id },
              data: { status: "DRAFT_READY" },
            });

            results.push({ contactId: cc.contactId, success: true });
          } catch (error) {
            results.push({
              contactId: cc.contactId,
              success: false,
              error:
                error instanceof Error ? error.message : "Generation failed",
            });
          }
        }

        await prisma.campaign.update({
          where: { id: input.campaignId as string },
          data: { status: "ACTIVE" },
        });

        return JSON.stringify({
          generated: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        });
      }

      // ── Drafts ──
      case "list_drafts": {
        const where: Record<string, unknown> = {
          contact: { userId },
        };
        if (input.contactId) where.contactId = input.contactId;
        if (input.status) where.status = input.status;

        const drafts = await prisma.emailDraft.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            subject: true,
            status: true,
            createdAt: true,
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            sentEmail: { select: { sentAt: true } },
          },
        });
        return JSON.stringify({ drafts, total: drafts.length });
      }

      case "get_draft": {
        const draft = await prisma.emailDraft.findFirst({
          where: {
            id: input.draftId as string,
            contact: { userId },
          },
          include: {
            contact: true,
            sentEmail: true,
            campaignContact: { include: { campaign: true } },
          },
        });
        if (!draft) return JSON.stringify({ error: "Draft not found" });
        return JSON.stringify(draft);
      }

      case "update_draft": {
        const existing = await prisma.emailDraft.findFirst({
          where: {
            id: input.draftId as string,
            contact: { userId },
          },
        });
        if (!existing) return JSON.stringify({ error: "Draft not found" });
        if (existing.status === "SENT") {
          return JSON.stringify({ error: "Cannot edit a sent email" });
        }

        const draft = await prisma.emailDraft.update({
          where: { id: input.draftId as string },
          data: {
            ...(input.subject !== undefined && {
              subject: input.subject as string,
            }),
            ...(input.body !== undefined && { body: input.body as string }),
            ...(input.status !== undefined && {
              status: input.status as "GENERATED" | "EDITED" | "APPROVED",
            }),
          },
          include: { contact: true },
        });

        if (input.status === "APPROVED" && draft.campaignContactId) {
          await prisma.campaignContact.update({
            where: { id: draft.campaignContactId },
            data: { status: "APPROVED" },
          });
        }

        return JSON.stringify(draft);
      }

      case "delete_draft": {
        const existing = await prisma.emailDraft.findFirst({
          where: {
            id: input.draftId as string,
            contact: { userId },
          },
        });
        if (!existing) return JSON.stringify({ error: "Draft not found" });
        await prisma.emailDraft.delete({
          where: { id: input.draftId as string },
        });
        return JSON.stringify({ success: true });
      }

      // ── Email ──
      case "send_email": {
        const draft = await prisma.emailDraft.findFirst({
          where: { id: input.draftId as string },
          include: { contact: true },
        });
        if (!draft) return JSON.stringify({ error: "Draft not found" });
        if (draft.contact.userId !== userId) {
          return JSON.stringify({ error: "Unauthorized" });
        }
        if (!draft.contact.email) {
          return JSON.stringify({ error: "Contact has no email address" });
        }

        const result = await sendEmail(
          userId,
          draft.contact.email,
          draft.subject,
          draft.body
        );

        await prisma.emailDraft.update({
          where: { id: input.draftId as string },
          data: { status: "SENT" },
        });

        const sentEmail = await prisma.sentEmail.create({
          data: {
            draftId: input.draftId as string,
            gmailMessageId: result.messageId,
            gmailThreadId: result.threadId,
          },
        });

        if (draft.campaignContactId) {
          await prisma.campaignContact.update({
            where: { id: draft.campaignContactId },
            data: { status: "SENT" },
          });
        }

        return JSON.stringify({ success: true, sentEmail });
      }

      case "get_email_threads": {
        if (!input.contactEmail) {
          return JSON.stringify({ error: "contactEmail is required" });
        }
        const threads = await fetchThreadsForContact(
          userId,
          input.contactEmail as string,
          10
        );
        return JSON.stringify({ threads, total: threads.length });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Tool execution failed",
    });
  }
}
