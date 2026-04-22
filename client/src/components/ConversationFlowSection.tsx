import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

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
    transition: { duration: 0.6, damping: 20, stiffness: 300 },
  },
};

export default function ConversationFlowSection() {
  return (
    <section id="flow" className="py-20 md:py-32 px-4 md:px-0 bg-secondary/30">
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
            <h2 className="text-3xl md:text-4xl font-bold">Conversation Flow</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              Example multi-turn conversation demonstrating natural language understanding
              and context-aware responses.
            </p>
          </motion.div>

          {/* Conversation Example */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="space-y-3">
              {[
                {
                  speaker: "user",
                  text: "이번 주 금요일에 뭐 있어?",
                  icon: "👤",
                },
                {
                  speaker: "bot",
                  text: "📅 4월 24일(금) 일정입니다:\n• 10:00-11:00  주간 스크럼\n• 14:00-15:30  디자인 리뷰\n• 17:00-17:30  1:1 미팅 (with 김팀장)\n\n일정을 추가하거나 수정할까요?",
                  icon: "🤖",
                },
                {
                  speaker: "user",
                  text: "디자인 리뷰 30분 앞당겨줘",
                  icon: "👤",
                },
                {
                  speaker: "bot",
                  text: "📅 '디자인 리뷰'를 13:30-15:00으로 변경할까요?",
                  icon: "🤖",
                },
                {
                  speaker: "user",
                  text: "응",
                  icon: "👤",
                },
                {
                  speaker: "bot",
                  text: "✅ 변경 완료!\n📅 디자인 리뷰 | 4/24(금) 13:30-15:00\n참석자 3명에게 변경 알림이 전송되었습니다.",
                  icon: "🤖",
                },
                {
                  speaker: "user",
                  text: "그리고 리뷰 끝나고 회식 장소 검색한 파일 있었는데",
                  icon: "👤",
                },
                {
                  speaker: "bot",
                  text: "🔍 Drive에서 '회식 장소' 관련 파일을 찾았습니다:\n1. 📄 2026 상반기 회식 장소 리스트.xlsx (4/15 수정)\n2. 📝 강남 맛집 정리.docs (3/28 수정)\n\n어떤 파일을 열어볼까요?",
                  icon: "🤖",
                },
              ].map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: msg.speaker === "user" ? 20 : -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex gap-3 ${
                    msg.speaker === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div className="text-2xl flex-shrink-0">{msg.icon}</div>
                  <Card
                    className={`max-w-lg p-4 border transition-all duration-300 ${
                      msg.speaker === "user"
                        ? "bg-primary/10 border-primary/30 text-foreground"
                        : "bg-accent/10 border-accent/30 text-foreground"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
                      {msg.text}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Processing Steps */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Message Processing Pipeline</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="space-y-6">
                {[
                  {
                    step: 1,
                    title: "Session Loading",
                    desc: "대화 컨텍스트와 함께 Redis에서 사용자 세션 검색",
                  },
                  {
                    step: 2,
                    title: "Authentication Check",
                    desc: "Google OAuth 자격증명 및 권한 확인",
                  },
                  {
                    step: 3,
                    title: "State-based Routing",
                    desc: "현재 대화 상태에 따라 메시지 라우팅",
                  },
                  {
                    step: 4,
                    title: "NLU Parsing",
                    desc: "Gemini API를 사용하여 의도 및 엔티티 추출",
                  },
                  {
                    step: 5,
                    title: "Parameter Validation",
                    desc: "누락된 매개변수 확인 및 명확화 요청",
                  },
                  {
                    step: 6,
                    title: "Confirmation",
                    desc: "사용자 승인을 위한 작업 요약 제시",
                  },
                  {
                    step: 7,
                    title: "API 실행",
                    desc: "적절한 Google API 커넥터 호출",
                  },
                  {
                    step: 8,
                    title: "Response Formatting",
                    desc: "결과 형식화 및 Telegram을 통해 사용자에게 다시 전송",
                  },
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    className="flex gap-4 pb-6 border-b border-border/30 last:border-b-0 last:pb-0"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-sm font-bold">
                      {item.step}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground mb-1">
                        {item.title}
                      </h4>
                      <p className="text-sm text-foreground/60">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* NLU Example */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">NLU Intent Parsing Example</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 border border-border/50 bg-card/50 backdrop-blur-sm">
                <h4 className="font-semibold mb-4 text-primary">Input</h4>
                <pre className="text-xs text-foreground/70 overflow-x-auto">
{`User Message:
"내일 오후 3시에 팀 미팅 잡아줘"`}
                </pre>
              </Card>
              <Card className="p-6 border border-border/50 bg-card/50 backdrop-blur-sm">
                <h4 className="font-semibold mb-4 text-accent">Parsed Output</h4>
                <pre className="text-xs text-foreground/70 overflow-x-auto font-mono">
{`{
  "intent": "calendar.create",
  "confidence": 0.98,
  "entities": {
    "date": "내일",
    "time": "15:00",
    "title": "팀 미팅"
  },
  "missing_params": [],
  "clarification": null
}`}
                </pre>
              </Card>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
