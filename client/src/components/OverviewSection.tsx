import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Mail, Calendar, FileText, CheckSquare, Cloud } from "lucide-react";

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

const services = [
  {
    icon: Mail,
    name: "Gmail",
    description: "자연어 명령으로 이메일 전송, 읽기, 검색",
  },
  {
    icon: Calendar,
    name: "캠린더",
    description: "지능형 스케줄링으로 일정 생성, 업데이트, 관리",
  },
  {
    icon: FileText,
    name: "Drive",
    description: "파일 검색, 업로드, 공유",
  },
  {
    icon: CheckSquare,
    name: "작업",
    description: "스마트 리마인더로 할 일 목록 생성 및 관리",
  },
  {
    icon: Cloud,
    name: "스프레드시트",
    description: "스프레드시트 데이터 읽기 및 쓰기",
  },
];

export default function OverviewSection() {
  return (
    <section id="overview" className="py-20 md:py-32 px-4 md:px-0">
      <div className="container">
        <motion.div
          className="max-w-4xl mx-auto space-y-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          {/* Section Header */}
          <motion.div variants={itemVariants} className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">프로젝트 개요</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              완전한 통합 흐름과 시스템 아키텍처 이해하기.
            </p>
          </motion.div>

          {/* Key Features Grid */}
          <motion.div
            className="grid md:grid-cols-2 gap-6"
            variants={containerVariants}
          >
            {[
              {
                title: "자연어 이해",
                description:
                  "Gemini API로 구동되며, 시스템은 대화 메시지에서 사용자 의도를 해석하고 적절한 Google API 호출을 실행합니다.",
              },
              {
                title: "양방향 통신",
                description:
                  "사용자는 Telegram을 통해 명령을 내리고, Google 서비스는 Webhook과 Pub/Sub를 통해 알림을 다시 전송합니다.",
              },
              {
                title: "상태 관리",
                description:
                  "Redis 기반 세션 관리는 컨단트 인식 및 FSM 상태 추적으로 다중 턴 대화를 처리합니다.",
              },
              {
                title: "OAuth 2.0 보안",
                description:
                  "암호화된 자격증명 저장소 및 사용자별 접니 제어로 안전한 사용자 인증을 제공합니다.",
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ y: -4 }}
                className="group"
              >
                <Card className="p-6 h-full border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold mb-3 group-hover:text-accent transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* Services */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">연동 서비스</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
              {services.map((service, index) => {
                const Icon = service.icon;
                return (
                  <motion.div
                    key={index}
                    whileHover={{ scale: 1.05 }}
                    className="group"
                  >
                    <Card className="p-4 text-center border border-border/50 hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Icon className="w-6 h-6 text-primary" />
                        </div>
                      </div>
                      <h4 className="font-semibold text-sm mb-2">{service.name}</h4>
                      <p className="text-xs text-foreground/60 leading-relaxed">
                        {service.description}
                      </p>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Data Flow Diagram */}
          <motion.div variants={itemVariants} className="space-y-4">
            <h3 className="text-2xl font-bold">데이터 흐름 아키텍처</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="space-y-6">
                {[
                  {
                    title: "흐름 A: 사용자 → Google",
                    description:
                      "Telegram → Webhook → NLU 분석 → 세션/확인 → Google API 호출 → 결과 응답",
                    color: "from-primary to-blue-600",
                  },
                  {
                    title: "흐름 B: Google → 사용자",
                    description:
                      "Google Push/Pub·Sub → 서버 수신 → 메시지 포맧 → Telegram 전달",
                    color: "from-accent to-cyan-500",
                  },
                  {
                    title: "흐름 C: 주기적 동기화",
                    description:
                      "Cloud Scheduler → 서버 → Google API 폴링 → 변경 감지 → Telegram 알림",
                    color: "from-green-500 to-emerald-600",
                  },
                ].map((flow, index) => (
                  <motion.div
                    key={index}
                    className="pb-6 border-b border-border/30 last:border-b-0 last:pb-0"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white mb-2 bg-gradient-to-r ${flow.color}`}>
                      {flow.title}
                    </div>
                    <p className="text-foreground/70 text-sm font-mono">
                      {flow.description}
                    </p>
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
