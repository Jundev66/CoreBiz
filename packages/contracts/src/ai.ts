import { z } from 'zod';

/**
 * Input of the AI assistant endpoints.
 *
 * The provider list is repeated here as literals instead of imported from the domain: the
 * contracts package has no dependencies, and a new provider needs an adapter anyway, so it
 * cannot appear in one place without the other being touched.
 */

export const aiProviderSchema = z.enum(['ollama', 'anthropic', 'gemini', 'openai_compatible']);

export const aiDraftSchema = z
  .object({
    provider: aiProviderSchema,
    baseUrl: z.string().trim().max(500, 'TooLong').optional(),
    /** Blank keeps the saved key. */
    apiKey: z.string().trim().max(1_000, 'TooLong').optional(),
  })
  .strict();

export type AiDraftInput = z.infer<typeof aiDraftSchema>;

export const saveAiSettingsSchema = aiDraftSchema
  .extend({ model: z.string().trim().min(1, 'Required').max(200, 'TooLong') })
  .strict();

export type SaveAiSettingsBody = z.infer<typeof saveAiSettingsSchema>;

/**
 * Structured, sanitized error context passed to the assistant to diagnose active failures.
 */
export const errorContextSchema = z
  .object({
    kind: z.string().regex(/^[A-Z][A-Za-z0-9_]{1,63}$/),
    incidentId: z
      .string()
      .regex(/^INC-[0-9A-F]{8}$/)
      .nullable()
      .optional(),
  })
  .strict();

export type ErrorContextInput = z.infer<typeof errorContextSchema>;

/**
 * A question with the conversation so far, optionally accompanied by the screen's active error context.
 *
 * The limits live here AND in the use case: here they stop an oversized body before any
 * work is done; there they keep the provider bill bounded whoever the caller is.
 */
export const askAssistantSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1, 'Required').max(2_000, 'TooLong'),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    errorContext: errorContextSchema.nullable().optional(),
  })
  .strict()
  .refine((body) => body.messages.at(-1)?.role === 'user', {
    message: 'InvalidFormat',
    path: ['messages'],
  });

export type AskAssistantBody = z.infer<typeof askAssistantSchema>;
