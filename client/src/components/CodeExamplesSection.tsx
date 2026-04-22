import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import CodeShowcase from "./CodeShowcase";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6 },
  },
};

export default function CodeExamplesSection() {
  return (
    <section id="code" className="py-20 md:py-32 px-4 md:px-0 bg-secondary/30">
      <div className="container">
        <motion.div
          className="max-w-5xl mx-auto space-y-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          {/* Section Header */}
          <motion.div variants={itemVariants} className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">Implementation Examples</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              Key code examples demonstrating core functionality and architecture patterns.
            </p>
          </motion.div>

          {/* Webhook Handler */}
          <motion.div variants={itemVariants} className="space-y-6">
            <CodeShowcase
              title="Telegram Webhook 핸들러"
              description="Telegram 메시지를 수신하고 처리하는 FastAPI 엔드포인트"
              code={`from fastapi import FastAPI, Request
from telegram import Update, Bot

app = FastAPI()
bot = Bot(token=TELEGRAM_BOT_TOKEN)

@app.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    data = await request.json()
    update = Update.de_json(data, bot)
    
    # Process update
    user_id = update.effective_user.id
    message_text = update.message.text
    
    # Route to message handler
    await message_router.handle_message(update, context)
    return {"ok": True}`}
            />
          </motion.div>

          {/* NLU Parser */}
          <motion.div variants={itemVariants} className="space-y-6">
            <CodeShowcase
              title="자연어 이해 엔진"
              description="엔티티 추출을 포함한 Gemini API 기반 의도 분석"
              code={`import google.generativeai as genai

class IntentParser:
    def __init__(self):
        genai.configure(api_key=GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-2.0-flash")
    
    async def parse(self, user_message: str, context: list) -> dict:
        prompt = f"""
        Extract intent and entities from: "{user_message}"
        Context: {json.dumps(context[-5:])}
        
        Return JSON:
        {{
            "intent": "calendar.create|gmail.send|drive.search",
            "confidence": 0.0-1.0,
            "entities": {{}},
            "missing_params": [],
            "clarification_question": null
        }}
        """
        response = await self.model.generate_content_async(prompt)
        return json.loads(response.text)`}
            />
          </motion.div>

          {/* Session Manager */}
          <motion.div variants={itemVariants} className="space-y-6">
            <CodeShowcase
              title="Redis 기반 세션 관리자"
              description="FSM을 사용한 다중 턴 대화 상태 관리"
              code={`from dataclasses import dataclass, asdict
from enum import Enum

class ConversationState(Enum):
    IDLE = 1
    AWAITING_DETAILS = 2
    AWAITING_CONFIRMATION = 3
    PROCESSING = 4

@dataclass
class UserSession:
    user_id: int
    state: ConversationState = ConversationState.IDLE
    collected_params: dict = field(default_factory=dict)
    context_stack: list = field(default_factory=list)
    ttl: int = 3600

class SessionManager:
    async def get_session(self, user_id: int) -> UserSession:
        data = await redis.get(f"session:{user_id}")
        return UserSession(**json.loads(data)) if data else UserSession(user_id)
    
    async def save_session(self, session: UserSession):
        await redis.setex(
            f"session:{session.user_id}",
            session.ttl,
            json.dumps(asdict(session))
        )`}
            />
          </motion.div>

          {/* Google Calendar Connector */}
          <motion.div variants={itemVariants} className="space-y-6">
            <CodeShowcase
              title="Google Calendar 커넥터"
              description="이벤트를 생성하고 관리하기 위한 OAuth 2.0 인증 API 호출"
              code={`from googleapiclient.discovery import build

class CalendarConnector:
    async def create_event(self, creds, params: dict) -> dict:
        service = build("calendar", "v3", credentials=creds)
        event = {
            "summary": params["title"],
            "start": {
                "dateTime": params["start_time"],
                "timeZone": "Asia/Seoul"
            },
            "end": {
                "dateTime": params["end_time"],
                "timeZone": "Asia/Seoul"
            },
            "attendees": [{"email": e} for e in params.get("attendees", [])],
            "reminders": {
                "useDefault": False,
                "overrides": [{"method": "popup", "minutes": 10}]
            }
        }
        result = service.events().insert(
            calendarId="primary",
            body=event
        ).execute()
        return result`}
            />
          </motion.div>

          {/* Push Notification Handler */}
          <motion.div variants={itemVariants} className="space-y-6">
            <CodeShowcase
              title="Google Calendar 푸시 알림"
              description="실시간 캘린더 변경을 수신하는 Webhook 엔드포인트"
              code={`@app.post("/google/push/calendar")
async def calendar_push(request: Request):
    channel_id = request.headers.get("X-Goog-Channel-ID")
    user_id = extract_user_from_channel(channel_id)
    
    # Get updated events
    creds = await auth_mgr.get_credentials(user_id)
    events = await calendar_connector.get_recent_changes(creds)
    
    # Send notifications to user
    for event in events:
        chat_id = await get_chat_id(user_id)
        await bot.send_message(
            chat_id=chat_id,
            text=f"📅 <b>{event['summary']}</b>\\n"
                 f"🕐 {event['start']['dateTime']}\\n"
                 f"📍 {event.get('location', 'TBD')}",
            parse_mode="HTML"
        )
    return {"ok": True}`}
            />
          </motion.div>

          {/* Message Router */}
          <motion.div variants={itemVariants} className="space-y-6">
            <CodeShowcase
              title="중앙 메시지 라우터"
              description="완전한 메시지 처리 파이프라인을 조율합니다"
              code={`class MessageRouter:
    async def handle_message(self, update: Update, context):
        user_id = update.effective_user.id
        text = update.message.text
        
        # 1. Load session
        session = await self.session_mgr.get_session(user_id)
        
        # 2. Check authentication
        if not await self.auth_mgr.has_credentials(user_id):
            auth_url = await self.auth_mgr.get_auth_url(user_id)
            await send_notification(chat_id, f"🔐 Auth required: {auth_url}")
            return
        
        # 3. Route by state
        if session.state == ConversationState.AWAITING_CONFIRMATION:
            await self._handle_confirmation(session, text)
        else:
            # 4. Parse intent
            parsed = await self.intent_parser.parse(text, session.context_stack)
            
            # 5. Validate parameters
            if parsed["missing_params"]:
                session.state = ConversationState.AWAITING_DETAILS
                await send_notification(chat_id, parsed["clarification_question"])
            else:
                # 6. Execute action
                await self._execute_action(session)
        
        # 7. Save session
        await self.session_mgr.save_session(session)`}
            />
          </motion.div>

          {/* Deployment Configuration */}
          <motion.div variants={itemVariants} className="space-y-6">
            <CodeShowcase
              title="Cloud Run 배포"
              description="Google Cloud에서 서버리스 배포를 위한 Docker 구성"
              code={`# Dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]

---

# cloudbuild.yaml (CI/CD Pipeline)
steps:
  - name: "gcr.io/cloud-builders/docker"
    args: ["build", "-t", "gcr.io/$PROJECT_ID/google-tg-bot", "."]
  
  - name: "gcr.io/cloud-builders/docker"
    args: ["push", "gcr.io/$PROJECT_ID/google-tg-bot"]
  
  - name: "gcr.io/cloud-builders/gcloud"
    args:
      - "run"
      - "deploy"
      - "google-tg-bot"
      - "--image=gcr.io/$PROJECT_ID/google-tg-bot"
      - "--region=asia-northeast3"
      - "--platform=managed"
      - "--memory=512Mi"`}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
