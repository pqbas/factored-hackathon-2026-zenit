ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "handledBy" varchar DEFAULT 'ai_agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "useCase" varchar(128);--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "language" varchar(16);--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Message" ADD COLUMN "blocked" boolean DEFAULT false NOT NULL;