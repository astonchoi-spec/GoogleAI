import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Shield, Lock, Eye, AlertCircle } from "lucide-react";

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

export default function SecuritySection() {
  return (
    <section id="security" className="py-20 md:py-32 px-4 md:px-0 bg-secondary/30">
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
            <h2 className="text-3xl md:text-4xl font-bold">Security Design</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              Multi-layered security architecture protecting user data and API credentials.
            </p>
          </motion.div>

          {/* Security Layers */}
          <motion.div
            className="grid md:grid-cols-2 gap-6"
            variants={containerVariants}
          >
            {[
              {
                icon: Lock,
                title: "Webhook 검증",
                description:
                  "모든 들어오는 Telegram Webhook은 HMAC 서명 및 비밀 토큰으로 검증됨",
              },
              {
                icon: Shield,
                title: "사용자 인증",
                description:
                  "사용자별 권한 및 역할 관리를 포함한 화이트리스트 기반 접근 제어",
              },
              {
                icon: AlertCircle,
                title: "속도 제한",
                description:
                  "슬라이딩 윈도우 속도 제한기: 분당 30개 요청, 남용 방지를 위한 5개 버스트 제한",
              },
              {
                icon: Eye,
                title: "감시 로깅",
                description:
                  "모든 작업의 포괄적인 로그: 사용자, 타임스탬프, 작업, IP 주소, 결과",
              },
            ].map((layer, index) => {
              const Icon = layer.icon;
              return (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  whileHover={{ y: -4 }}
                  className="group"
                >
                  <Card className="p-6 border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                    <div className="flex gap-4 mb-4">
                      <div className="flex-shrink-0">
                        <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">{layer.title}</h3>
                      </div>
                    </div>
                    <p className="text-foreground/60 text-sm">{layer.description}</p>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Credential Management */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">OAuth 2.0 Credential Management</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="space-y-6">
                {[
                  {
                    step: "토큰 저장소",
                    desc: "Fernet (AES-128)으로 암호화된 자격증명 및 사용자별 격리를 통해 Firestore에 저장",
                  },
                  {
                    step: "토큰 새로고침",
                    desc: "액세스 토큰 만료 시 자동 새로고침 토큰 회전, 세션 연속성 유지",
                  },
                  {
                    step: "범위 제한",
                    desc: "최소 OAuth 범위 요청: gmail.modify, calendar, drive, spreadsheets, tasks만",
                  },
                  {
                    step: "취소",
                    desc: "사용자는 /settings 명령을 통해 언제든지 액세스를 취소할 수 있으며, 토큰을 즉시 무효화함",
                  },
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    className="flex gap-4 pb-6 border-b border-border/30 last:border-b-0 last:pb-0"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground mb-1">
                        {item.step}
                      </h4>
                      <p className="text-sm text-foreground/60">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* Data Protection */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Data Protection Measures</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "전송 중",
                  items: [
                    "모든 연결에 TLS 1.3",
                    "HTTPS 전용 통신",
                    "Webhook 비밀 토큰 검증",
                  ],
                },
                {
                  title: "저장 중",
                  items: [
                    "자격증명에 대한 AES-128 암호화",
                    "기본적으로 Firestore 암호화",
                    "Redis 메모리 내 암호화",
                  ],
                },
                {
                  title: "접근 제어",
                  items: [
                    "OAuth 2.0 + PKCE 흐름",
                    "사용자별 데이터 격리",
                    "서비스 계정 제한",
                  ],
                },
                {
                  title: "모니터링",
                  items: [
                    "실시간 감시 로그",
                    "이상 탐지 경고",
                    "속도 제한 위반 로깅됨",
                  ],
                },
              ].map((category, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="group"
                >
                  <Card className="p-6 border border-border/50 hover:border-accent/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                    <h4 className="font-semibold text-primary mb-4 group-hover:text-accent transition-colors">
                      {category.title}
                    </h4>
                    <ul className="space-y-2">
                      {category.items.map((item, i) => (
                        <li
                          key={i}
                          className="text-sm text-foreground/70 flex items-start gap-2"
                        >
                          <span className="text-accent mt-1">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Compliance */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Compliance & Best Practices</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-semibold text-accent mb-4">Standards</h4>
                  <ul className="space-y-2 text-sm text-foreground/70">
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> OWASP Top 10 compliance
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> OAuth 2.0 RFC 6749
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> NIST Cybersecurity Framework
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> Google Cloud Security Best Practices
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-accent mb-4">Incident Response</h4>
                  <ul className="space-y-2 text-sm text-foreground/70">
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> 24/7 monitoring and alerting
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> Automated threat detection
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> Incident response playbook
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span> Regular security audits
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
