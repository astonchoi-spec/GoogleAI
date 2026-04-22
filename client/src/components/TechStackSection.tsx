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

export default function TechStackSection() {
  return (
    <section id="tech" className="py-20 md:py-32 px-4 md:px-0">
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
            <h2 className="text-3xl md:text-4xl font-bold">Technology Stack</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              Production-grade technologies selected for scalability, reliability, and
              developer experience.
            </p>
          </motion.div>

          {/* Tech Stack Grid */}
          <motion.div
            className="grid md:grid-cols-3 gap-6"
            variants={containerVariants}
          >
            {[
              {
                category: "프론트엔드",
                items: ["Telegram Bot API", "Webhook 통합", "실시간 메시징"],
              },
              {
                category: "백엔드",
                items: ["FastAPI (Python 3.12+)", "Async/Await", "RESTful API"],
              },
              {
                category: "AI/NLU",
                items: ["Gemini 2.0 Flash API", "의도 분석", "엔티티 추출"],
              },
              {
                category: "인증",
                items: ["OAuth 2.0 + PKCE", "Google Workspace", "토큰 새로고침"],
              },
              {
                category: "상태 관리",
                items: ["Redis (Memorystore)", "세션 저장소", "캐시 계층"],
              },
              {
                category: "데이터베이스",
                items: ["Firestore", "NoSQL 문서 저장소", "실시간 동기화"],
              },
              {
                category: "푸시 알림",
                items: ["Google Calendar Watch", "Gmail Pub/Sub", "Webhook 전달"],
              },
              {
                category: "비동기 처리",
                items: ["Cloud Tasks", "작업 큐", "재시도 로직"],
              },
              {
                category: "스케줄링",
                items: ["Cloud Scheduler", "Cron 작업", "정기적 동기화"],
              },
              {
                category: "인프라",
                items: ["Cloud Run", "서버리스", "서울 지역"],
              },
              {
                category: "보안",
                items: ["Secret Manager", "암호화", "감시 로그"],
              },
              {
                category: "CI/CD",
                items: ["Cloud Build", "Docker", "자동 배포"],
              },
            ].map((stack, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -4, scale: 1.02 }}
                className="group"
              >
                <Card className="p-6 border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                  <h3 className="font-semibold text-primary mb-4 group-hover:text-accent transition-colors">
                    {stack.category}
                  </h3>
                  <ul className="space-y-2">
                    {stack.items.map((item, i) => (
                      <li
                        key={i}
                        className="text-sm text-foreground/70 flex items-start gap-2"
                      >
                        <span className="text-accent mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* Architecture Layers */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Architecture Layers</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="space-y-4">
                {[
                  {
                    layer: "프레젠테이션",
                    tech: "Telegram Bot API (Webhook)",
                    role: "사용자 인터페이스",
                  },
                  {
                    layer: "애플리케이션",
                    tech: "FastAPI / Python",
                    role: "비즈니스 로직 & 오케스트레이션",
                  },
                  {
                    layer: "통합",
                    tech: "Google APIs (Gmail, Calendar, Drive, Sheets, Tasks)",
                    role: "외부 서비스 커넥터",
                  },
                  {
                    layer: "상태 & 캐시",
                    tech: "Redis / Memorystore",
                    role: "세션 관리 & 성능",
                  },
                  {
                    layer: "지속성",
                    tech: "Firestore",
                    role: "사용자 데이터 & 구성",
                  },
                  {
                    layer: "인프라",
                    tech: "Google Cloud Run",
                    role: "서버리스 컴퓨팅 & 호스팅",
                  },
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center gap-4 pb-4 border-b border-border/30 last:border-b-0 last:pb-0"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="w-32 font-semibold text-primary text-sm">
                      {item.layer}
                    </div>
                    <div className="flex-1">
                      <div className="font-mono text-sm text-accent mb-1">
                        {item.tech}
                      </div>
                      <div className="text-xs text-foreground/60">{item.role}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* Development Setup */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Local Development</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <pre className="text-xs text-foreground/70 overflow-x-auto font-mono leading-relaxed">
{`# docker-compose.yml (Local Development)
version: "3.9"
services:
  app:
    build: .
    ports: ["8080:8080"]
    env_file: .env
    depends_on: [redis, firestore-emulator]
  
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  
  firestore-emulator:
    image: google/cloud-sdk
    command: gcloud emulators firestore start --host-port=0.0.0.0:8081

# Run locally
$ docker-compose up
$ curl http://localhost:8080/health`}
              </pre>
            </Card>
          </motion.div>

          {/* Performance Metrics */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Performance Targets</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { metric: "메시지 지연", target: "< 500ms" },
                { metric: "API 응답 시간", target: "< 2초" },
                { metric: "Webhook 처리", target: "< 1초" },
                { metric: "세션 로드", target: "< 100ms" },
                { metric: "동시 사용자", target: "1000명 이상" },
                { metric: "가동 시간 SLA", target: "99.9%" },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="group"
                >
                  <Card className="p-6 border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm">
                    <div className="text-sm text-foreground/60 mb-2">
                      {item.metric}
                    </div>
                    <div className="text-2xl font-bold text-accent group-hover:text-primary transition-colors">
                      {item.target}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
