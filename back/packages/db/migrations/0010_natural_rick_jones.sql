CREATE TABLE "ai_chatbot"."Handoff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"reason" varchar(64) NOT NULL,
	"summary" text,
	"facts" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Handoff" ADD CONSTRAINT "Handoff_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "ai_chatbot"."Chat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "Handoff_open_chat" ON "ai_chatbot"."Handoff" USING btree ("chatId") WHERE "resolvedAt" is null;