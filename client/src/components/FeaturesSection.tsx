import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { MessageSquare, Zap, Lock, BarChart3 } from "lucide-react";

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

const features = [
  {
    icon: MessageSquare,
    title: "다중 턴 대화",
    description:
      "FSM 기반 상태 관리로 컨텍스트 인식 다중 턴 대화 및 전체 대화 기록 제공",
  },
  {
    icon: Zap,
    title: "실시간 알림",
    description:
      "서비스 변경 시 즉시 알림을 위한 Google Push API 및 Pub/Sub 통합",
  },
  {
    icon: Lock,
    title: "엔터프라이즈 보안",
    description:
      "OAuth 2.0, 암호화된 자격증명 저장소, 속도 제한, 포괄적인 감시 로깅",
  },
  {
    icon: BarChart3,
    title: "지능형 분석",
    description:
      "사용 패턴, 명령 성공률 및 시스템 성능 지표 추적",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-32 px-4 md:px-0">
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
            <h2 className="text-3xl md:text-4xl font-bold">Key Features</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              Advanced capabilities designed for seamless integration and user experience.
            </p>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            className="grid md:grid-cols-2 gap-6"
            variants={containerVariants}
          >
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  whileHover={{ y: -8, scale: 1.02 }}
                  className="group"
                >
                  <Card className="p-8 border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                    <div className="flex gap-4 mb-4">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 group-hover:from-primary/30 group-hover:to-accent/30 transition-all">
                          <Icon className="h-7 w-7 text-primary group-hover:text-accent transition-colors" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold group-hover:text-accent transition-colors">
                          {feature.title}
                        </h3>
                      </div>
                    </div>
                    <p className="text-foreground/60 text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Supported Commands */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Supported Commands</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  cmd: "/calendar",
                  desc: "이벤트 관리: 생성, 목록, 업데이트, 삭제",
                },
                {
                  cmd: "/mail",
                  desc: "이메일 전송, 메시지 읽기, 받은편지함 검색",
                },
                {
                  cmd: "/drive",
                  desc: "파일 검색, 업로드, 문서 공유",
                },
                {
                  cmd: "/sheets",
                  desc: "스프레드시트 데이터 읽기 및 쓰기",
                },
                {
                  cmd: "/tasks",
                  desc: "할 일 목록 생성 및 관리",
                },
                {
                  cmd: "/notify",
                  desc: "알림 환경설정 구성",
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group"
                >
                  <Card className="p-4 border border-border/50 hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm">
                    <div className="font-mono text-sm text-primary font-semibold mb-1 group-hover:text-accent transition-colors">
                      {item.cmd}
                    </div>
                    <p className="text-xs text-foreground/60">{item.desc}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Conversation States */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Conversation States</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    state: "대기 중",
                    desc: "사용자 명령을 받을 준비 완료",
                  },
                  {
                    state: "세부 정보 대기 중",
                    desc: "누락된 매개변수 수집 중",
                  },
                  {
                    state: "확인 대기 중",
                    desc: "사용자 승인 대기 중",
                  },
                  {
                    state: "파일 업로드 대기 중",
                    desc: "파일 첨부 예상",
                  },
                  {
                    state: "선택 대기 중",
                    desc: "사용자가 옵션에서 선택 중",
                  },
                  {
                    state: "처리 중",
                    desc: "API 호출 실행 중",
                  },
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="text-center p-4 rounded-lg border border-border/30 hover:border-accent/50 transition-all"
                  >
                    <div className="inline-block px-3 py-1 rounded-full text-xs font-mono font-semibold text-primary bg-primary/10 mb-2">
                      {item.state}
                    </div>
                    <p className="text-xs text-foreground/60">{item.desc}</p>
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
