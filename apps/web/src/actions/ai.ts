'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assistantStatus, type AssistantStatusView } from '@/api/ai';
import { apiForRequest } from '@/api/session';

/**
 * Server Actions of the AI assistant.
 *
 * Like every other action, none decides a permission: the API does. They only turn form
 * input into the request body and the answer into something a component can render.
 */

const draftInput = z.object({
  provider: z.enum(['ollama', 'anthropic', 'gemini', 'openai_compatible']),
  baseUrl: z.string().trim().max(500).optional(),
  apiKey: z.string().trim().max(1_000).optional(),
});

type Draft = z.infer<typeof draftInput>;

export interface AiFormState {
  readonly status: 'idle' | 'success' | 'error';
  readonly errorKind?: string;
  readonly models?: readonly { readonly id: string; readonly label: string }[];
  /** The provider the models were listed for, so a stale list is not offered for another. */
  readonly provider?: string;
}

/** Blank strings are "not given": the API reads a missing key as "keep the saved one". */
function clean(draft: Draft) {
  return {
    provider: draft.provider,
    ...(draft.baseUrl !== undefined && draft.baseUrl !== '' ? { baseUrl: draft.baseUrl } : {}),
    ...(draft.apiKey !== undefined && draft.apiKey !== '' ? { apiKey: draft.apiKey } : {}),
  };
}

function read(formData: FormData) {
  const optional = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : undefined;
  };
  return {
    provider: optional('provider'),
    baseUrl: optional('baseUrl'),
    apiKey: optional('apiKey'),
    model: optional('model'),
  };
}

/** "Test and load models": asks the provider which models this key can use. */
export async function listAiModelsAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const parsed = draftInput.safeParse(read(formData));
  if (!parsed.success) return { status: 'error', errorKind: 'InvalidFormat' };

  const { listAiModels } = await apiForRequest();
  const result = await listAiModels(clean(parsed.data));
  if (!result.ok) {
    return { status: 'error', errorKind: result.error.kind, provider: parsed.data.provider };
  }

  return { status: 'success', models: result.value.models, provider: parsed.data.provider };
}

export async function saveAiSettingsAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const raw = read(formData);
  const parsed = draftInput.extend({ model: z.string().trim().min(1) }).safeParse(raw);
  if (!parsed.success) {
    // Almost always the model select left empty; the form words `Required` as "pick a model".
    const modelMissing = raw.model === undefined || raw.model.trim() === '';
    if (modelMissing) return { status: 'error', errorKind: 'Required' };
    return { status: 'error', errorKind: 'InvalidFormat' };
  }

  const { saveAiSettings } = await apiForRequest();
  const result = await saveAiSettings({ ...clean(parsed.data), model: parsed.data.model });
  if (!result.ok) return { status: 'error', errorKind: result.error.kind };

  // The help panel in every screen changes from "set it up" to the chat.
  revalidatePath('/', 'layout');
  return { status: 'success' };
}

export async function removeAiSettingsAction(): Promise<AiFormState> {
  const { removeAiSettings } = await apiForRequest();
  const result = await removeAiSettings();
  if (!result.ok) return { status: 'error', errorKind: result.error.kind };

  revalidatePath('/', 'layout');
  return { status: 'success' };
}

/** Read by the help panel when it opens, so closed panels cost no request. */
export async function assistantStatusAction(): Promise<AssistantStatusView | null> {
  try {
    return await assistantStatus();
  } catch {
    // The panel still explains errors without it; it just cannot offer the assistant.
    return null;
  }
}

const askInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(20),
});

export type AskAssistantResult =
  | { readonly ok: true; readonly reply: string }
  | { readonly ok: false; readonly errorKind: string };

export async function askAssistantAction(
  messages: readonly { role: 'user' | 'assistant'; content: string }[],
): Promise<AskAssistantResult> {
  // Only the most recent turns travel: the API would cut them anyway, and a long
  // conversation must not become a body too large to send.
  const parsed = askInput.safeParse({ messages: messages.slice(-20) });
  if (!parsed.success) return { ok: false, errorKind: 'InvalidFormat' };

  const { askAssistant } = await apiForRequest();
  const result = await askAssistant(parsed.data);
  return result.ok
    ? { ok: true, reply: result.value.reply }
    : { ok: false, errorKind: result.error.kind };
}
