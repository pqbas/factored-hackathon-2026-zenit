ALTER TABLE "ai_chatbot"."TurnMetric" ADD COLUMN "guardFired" boolean;--> statement-breakpoint
ALTER TABLE "ai_chatbot"."TurnMetric" ADD COLUMN "guardMissingTool" varchar(64);--> statement-breakpoint
ALTER TABLE "ai_chatbot"."TurnMetric" ADD COLUMN "guardAction" varchar(32);