import { z } from 'zod';
import type { LanguageModelUsage, UIMessage } from 'ai';

const messageMetadataSchema = z.object({
  createdAt: z.string(),
  blocked: z.boolean().optional(),
});

type MessageMetadata = z.infer<typeof messageMetadataSchema>;


export type CustomUIDataTypes = {
  error: string;
  usage: LanguageModelUsage;
  'conversation-state': { handledBy: string };
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes
>;

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}

export type { VisibilityType } from '@chat-template/utils';
