import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";

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

export default function RoadmapSection() {
  return (
    <section id="roadmap" className="py-20 md:py-32 px-4 md:px-0">
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
            <h2 className="text-3xl md:text-4xl font-bold">Development Roadmap</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              Phased implementation strategy for building the complete integration platform.
            </p>
          </motion.div>

          {/* Timeline */}
          <motion.div
            className="space-y-6"
            variants={containerVariants}
          >
            {[
              {
                phase: "1단계",
                title: "핵심 통합",
                status: "기초",
                features: [
                  "캘린더 이벤트 생성 및 쿼리",
                  "Gmail 읽기 및 알림 처리",
                  "기본 자연어 분석",
                  "OAuth 2.0 인증 흐름",
                  "Redis 세션 관리",
                  "Telegram Webhook 통합",
                ],
              },
              {
                phase: "2단계",
                title: "확장 서비스",
                status: "확장",
                features: [
                  "Google Drive 파일 검색 및 업로드",
                  "Google Sheets 읽기 및 쓰기 작업",
                  "다중 턴 대화 지원",
                  "Gemini API를 사용한 고급 NLU",
                  "대화 컨텍스트 추적",
                  "Firestore 데이터 지속성",
                ],
              },
              {
                phase: "3단계",
                title: "푸시 알림",
                status: "실시간",
                features: [
                  "Google Calendar Watch API",
                  "Gmail Pub/Sub 통합",
                  "실시간 이벤트 알림",
                  "Cloud Scheduler를 사용한 정기적 동기화",
                  "변경 감지 및 경고",
                  "사용자 알림 환경설정",
                ],
              },
              {
                phase: "4단계",
                title: "지능형 & 확장",
                status: "고급",
                features: [
                  "AI 기반 스마트 제안",
                  "다중 사용자 팀 협업",
                  "관리용 웹 대시보드",
                  "고급 분석 및 보고",
                  "사용자 정의 자동화 워크플로우",
                  "엔터프라이즈 기능 및 SLA",
                ],
              },
            ].map((phase, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                className="group"
              >
                <Card className="p-8 border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm">
                  <div className="flex items-start gap-6">
                    {/* Timeline Marker */}
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white ${
                        index < 2
                          ? "bg-gradient-to-br from-primary to-accent"
                          : "bg-gradient-to-br from-muted to-muted-foreground"
                      }`}>
                        {index < 2 ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : (
                          <Circle className="w-6 h-6" />
                        )}
                      </div>
                      {index < 3 && (
                        <div className="w-1 h-16 bg-gradient-to-b from-border to-transparent mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold">{phase.phase}: {phase.title}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          index < 2
                            ? "bg-accent/20 text-accent"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {phase.status}
                        </span>
                      </div>
                      <ul className="grid md:grid-cols-2 gap-3 mt-4">
                        {phase.features.map((feature, i) => (
                          <li
                            key={i}
                            className="text-sm text-foreground/70 flex items-start gap-2"
                          >
                            <span className="text-primary mt-1">✓</span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* Success Metrics */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Success Metrics</h3>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  metric: "사용자 채택",
                  target: "1000명 이상 활성 사용자",
                  timeline: "6개월",
                },
                {
                  metric: "시스템 신뢰성",
                  target: "99.9% 가동 시간 SLA",
                  timeline: "지속적",
                },
                {
                  metric: "성능",
                  target: "< 500ms 지연",
                  timeline: "2단계",
                },
                {
                  metric: "명령 성공",
                  target: "> 95% 정확도",
                  timeline: "3단계",
                },
                {
                  metric: "사용자 만족도",
                  target: "> 4.5/5 평점",
                  timeline: "4단계",
                },
                {
                  metric: "확장성",
                  target: "10,000명 이상 동시",
                  timeline: "4단계",
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="group"
                >
                  <Card className="p-6 border border-border/50 hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                    <h4 className="font-semibold text-primary mb-2 group-hover:text-accent transition-colors">
                      {item.metric}
                    </h4>
                    <p className="text-sm text-foreground/70 mb-3">{item.target}</p>
                    <p className="text-xs text-foreground/50 font-mono">
                      Timeline: {item.timeline}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Key Milestones */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Key Milestones</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="space-y-4">
                {[
                  "1-2개월: Calendar & Gmail을 포함한 1단계 MVP",
                  "3개월: 2단계 - Drive & Sheets 통합",
                  "4-5개월: 3단계 - 푸시 알림 및 실시간 동기화",
                  "6개월 이상: 4단계 - AI 기능 및 엔터프라이즈 기능",
                ].map((milestone, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center gap-4 pb-4 border-b border-border/30 last:border-b-0 last:pb-0"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center text-white text-sm font-bold">
                      {index + 1}
                    </div>
                    <p className="text-foreground/70 font-mono text-sm">{milestone}</p>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
