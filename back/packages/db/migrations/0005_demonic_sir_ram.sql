ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "assignedTo" varchar(256);--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "assignedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "closedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Message" ADD COLUMN "senderType" varchar;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Message" ADD COLUMN "senderId" varchar(256);