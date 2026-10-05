CREATE TABLE "ai_chatbot"."AgentTurn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"messageId" uuid NOT NULL,
	"userId" text NOT NULL,
	"sessionToken" varchar(256),
	"status" varchar DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextAttemptAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chatbot"."AgentTurn" ADD CONSTRAINT "AgentTurn_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "ai_chatbot"."Chat"("id") ON DELETE no action ON UPDATE no action;