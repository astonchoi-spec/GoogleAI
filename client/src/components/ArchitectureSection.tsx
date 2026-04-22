import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Database, Server, Shield, Zap } from "lucide-react";

const ARCH_ACCENT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663564692130/VwnbDswZfqsXEDyhYCCJUM/architecture-accent-2EoqDtUo2aBMmZgzdnxsPJ.webp";

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

const components = [
  {
    icon: Server,
    title: "메시지 라우터",
    description: "모든 메시지 흐름과 라우팅 로직을 조율하는 중앙 디스패처",
  },
  {
    icon: Zap,
    title: "NLU 엔진",
    description: "Gemini API 기반의 자연어 이해 및 의도 분석",
  },
  {
    icon: Database,
    title: "세션 관리자",
    description: "다중 턴 대화를 위한 Redis 기반 상태 관리",
  },
  {
    icon: Shield,
    title: "서비스 커넥터",
    description: "각 구글 서비스를 위한 OAuth 2.0 인증 커넥터",
  },
];

export default function ArchitectureSection() {
  return (
    <section id="architecture" className="py-20 md:py-32 px-4 md:px-0 bg-secondary/30">
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
            <h2 className="text-3xl md:text-4xl font-bold">System Architecture</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              A scalable, cloud-native architecture built on Google Cloud Platform with
              FastAPI, Redis, and Firestore for production-grade reliability.
            </p>
          </motion.div>

          {/* Architecture Diagram */}
          <motion.div
            variants={itemVariants}
            className="relative"
            whileHover={{ scale: 1.02 }}
          >
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
              <div className="relative aspect-video md:aspect-auto md:h-96 flex items-center justify-center">
                <img
                  src={ARCH_ACCENT_URL}
                  alt="Architecture Diagram"
                  className="w-full h-full object-contain"
                />
              </div>
            </Card>
          </motion.div>

          {/* Core Components */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Core Components</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {components.map((comp, index) => {
                const Icon = comp.icon;
                return (
                  <motion.div
                    key={index}
                    variants={itemVariants}
                    whileHover={{ y: -4 }}
                  >
                    <Card className="p-6 border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                      <div className="flex gap-4">
                        <div className="flex-shrink-0">
                          <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10">
                            <Icon className="h-6 w-6 text-primary" />
                          </div>
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold mb-2">{comp.title}</h4>
                          <p className="text-foreground/60 text-sm">{comp.description}</p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Infrastructure Stack */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Infrastructure Stack</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  category: "컴퓨팅",
                  items: ["Cloud Run", "FastAPI/Python", "서버리스"],
                },
                {
                  category: "데이터 & 상태",
                  items: ["Firestore (DB)", "Redis (캐시)", "Pub/Sub (이벤트)"],
                },
                {
                  category: "보안 & 운영",
                  items: ["Secret Manager", "Cloud Scheduler", "Cloud Build"],
                },
              ].map((stack, index) => (
                <motion.div
                  key={index}
                  whileHover={{ scale: 1.05 }}
                  className="group"
                >
                  <Card className="p-6 border border-border/50 hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                    <h4 className="font-semibold text-primary mb-4 group-hover:text-accent transition-colors">
                      {stack.category}
                    </h4>
                    <ul className="space-y-2">
                      {stack.items.map((item, i) => (
                        <li
                          key={i}
                          className="text-sm text-foreground/70 flex items-start gap-2"
                        >
                          <span className="text-accent mt-1">→</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Deployment Pipeline */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Deployment Pipeline</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="space-y-4">
                {[
                  "소스 코드 (GitHub) → Cloud Build",
                  "Docker 빌드 및 Container Registry에 푸시",
                  "Cloud Run에 배포 (아시아-동북동부3 지역)",
                  "자동 스케일링: 부하에 따라 1-10개 인스턴스",
                  "Secret Manager에서 주입된 시크릿",
                ].map((step, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center text-white text-sm font-semibold">
                      {index + 1}
                    </div>
                    <p className="text-foreground/70 font-mono text-sm">{step}</p>
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
