CREATE TABLE "ai_chatbot"."TurnMetric" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"messageId" uuid,
	"source" varchar NOT NULL,
	"startedAt" timestamp NOT NULL,
	"durationMs" integer NOT NULL,
	"intent" varchar(128),
	"useCase" varchar(128),
	"language" varchar(16),
	"blocked" boolean DEFAULT false NOT NULL,
	"handoffReason" varchar(64),
	"inputTokens" integer,
	"outputTokens" integer,
	"model" varchar(128),
	"promptVersion" varchar(64),
	"classifier" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chatbot"."TurnMetric" ADD CONSTRAINT "TurnMetric_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "ai_chatbot"."Chat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "TurnMetric_createdAt" ON "ai_chatbot"."TurnMetric" USING btree ("createdAt");