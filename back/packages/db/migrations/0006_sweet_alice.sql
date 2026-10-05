CREATE TABLE "ai_chatbot"."ResolutionEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"resolvedBy" varchar NOT NULL,
	"hadHuman" boolean NOT NULL,
	"useCase" varchar(128),
	"resolvedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chatbot"."Chat" ADD COLUMN "hadHuman" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."ResolutionEvent" ADD CONSTRAINT "ResolutionEvent_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "ai_chatbot"."Chat"("id") ON DELETE no action ON UPDATE no action;