import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export default function APIReferenceSection() {
  return (
    <section id="api" className="py-20 md:py-32 px-4 md:px-0">
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
            <h2 className="text-3xl md:text-4xl font-bold">API Reference</h2>
            <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
              Complete API endpoints and request/response specifications.
            </p>
          </motion.div>

          {/* API Endpoints */}
          <motion.div variants={itemVariants} className="space-y-6">
            <Tabs defaultValue="webhook" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-secondary/50">
                <TabsTrigger value="webhook">Webhook</TabsTrigger>
                <TabsTrigger value="oauth">OAuth</TabsTrigger>
                <TabsTrigger value="push">Push</TabsTrigger>
              </TabsList>

              {/* Webhook Tab */}
              <TabsContent value="webhook" className="space-y-4 mt-6">
                <Card className="p-6 border border-border/50 bg-card/50 backdrop-blur-sm">
                  <div className="space-y-4">
                    <div>
                      <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-primary to-blue-600 mb-3">
                        POST
                      </div>
                      <h4 className="font-mono text-sm font-semibold text-foreground">
                        /telegram/webhook
                      </h4>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground/70 mb-2">
                          Request Body
                        </p>
                        <pre className="bg-secondary/50 p-3 rounded text-xs overflow-x-auto text-foreground/70">
{`{
  "update_id": 123456789,
  "message": {
    "message_id": 1,
    "from": { "id": 987654321, "is_bot": false },
    "chat": { "id": 987654321, "type": "private" },
    "date": 1713667200,
    "text": "내일 오후 3시에 팀 미팅 잡아줘"
  }
}`}
                        </pre>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-foreground/70 mb-2">
                          Response
                        </p>
                        <pre className="bg-secondary/50 p-3 rounded text-xs overflow-x-auto text-foreground/70">
{`{
  "ok": true,
  "result": {
    "status": "processing",
    "intent": "calendar.create",
    "confidence": 0.98
  }
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* OAuth Tab */}
              <TabsContent value="oauth" className="space-y-4 mt-6">
                <Card className="p-6 border border-border/50 bg-card/50 backdrop-blur-sm">
                  <div className="space-y-4">
                    <div>
                      <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-accent to-cyan-500 mb-3">
                        GET
                      </div>
                      <h4 className="font-mono text-sm font-semibold text-foreground">
                        /oauth/authorize
                      </h4>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground/70 mb-2">
                          Query Parameters
                        </p>
                        <div className="space-y-2 text-xs text-foreground/70">
                          <div className="flex gap-2">
                            <span className="font-mono text-primary">user_id</span>
                            <span>Telegram user ID</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="font-mono text-primary">redirect_uri</span>
                            <span>Callback URL after auth</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-foreground/70 mb-2">
                          Response
                        </p>
                        <pre className="bg-secondary/50 p-3 rounded text-xs overflow-x-auto text-foreground/70">
{`{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "secure_random_token",
  "expires_in": 3600
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Push Tab */}
              <TabsContent value="push" className="space-y-4 mt-6">
                <Card className="p-6 border border-border/50 bg-card/50 backdrop-blur-sm">
                  <div className="space-y-4">
                    <div>
                      <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 mb-3">
                        POST
                      </div>
                      <h4 className="font-mono text-sm font-semibold text-foreground">
                        /google/push/calendar
                      </h4>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground/70 mb-2">
                          Headers
                        </p>
                        <div className="space-y-2 text-xs text-foreground/70 font-mono">
                          <div>X-Goog-Channel-ID: cal-watch-{`{user_id}`}</div>
                          <div>X-Goog-Channel-Token: {`{secure_token}`}</div>
                          <div>X-Goog-Resource-State: exists</div>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-foreground/70 mb-2">
                          Telegram Notification
                        </p>
                        <pre className="bg-secondary/50 p-3 rounded text-xs overflow-x-auto text-foreground/70">
{`📅 일정 알림
  팀 미팅
  🕐 2026-04-22T15:00:00+09:00
  📍 회의실 B`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>

          {/* Error Handling */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Error Handling</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  code: 400,
                  message: "잘못된 요청",
                  desc: "잘못된 매개변수 또는 누락된 필수 필드",
                },
                {
                  code: 401,
                  message: "승인되지 않음",
                  desc: "누락되었거나 잘못된 인증 자격증명",
                },
                {
                  code: 403,
                  message: "금지됨",
                  desc: "이 작업에 대해 사용자가 승인되지 않음",
                },
                {
                  code: 429,
                  message: "속도 제한됨",
                  desc: "너무 많은 요청, 지연 후 재시도",
                },
                {
                  code: 500,
                  message: "내부 서버 오류",
                  desc: "서버 오류, 상태 페이지 확인",
                },
                {
                  code: 503,
                  message: "서비스를 사용할 수 없음",
                  desc: "유지 보수를 위해 서비스가 일시적으로 중단됨",
                },
              ].map((error, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="group"
                >
                  <Card className="p-4 border border-border/50 hover:border-destructive/50 transition-all duration-300 bg-card/50 backdrop-blur-sm h-full">
                    <div className="font-mono text-sm font-bold text-destructive mb-1">
                      {error.code}
                    </div>
                    <div className="font-semibold text-foreground mb-1">
                      {error.message}
                    </div>
                    <p className="text-xs text-foreground/60">{error.desc}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Rate Limits */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-2xl font-bold">Rate Limits</h3>
            <Card className="p-8 border border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-semibold text-accent mb-4">Per User</h4>
                  <ul className="space-y-2 text-sm text-foreground/70">
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      30 requests per minute
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      5 burst requests allowed
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      Sliding window algorithm
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-accent mb-4">Global</h4>
                  <ul className="space-y-2 text-sm text-foreground/70">
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      10,000 requests per minute
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      Automatic backoff on 429
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-primary">•</span>
                      Retry-After header included
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
