import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const HERO_BG_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663564692130/VwnbDswZfqsXEDyhYCCJUM/hero-bg-2EoqDtUo2aBMmZgzdnxsPJ.webp";

const ICON_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663564692130/VwnbDswZfqsXEDyhYCCJUM/google-telegram-logo-Sb8mcjC7qzaCV3DDp7BnCx.webp";

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Animated Background */}
      <motion.div
        className="absolute inset-0 -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, type: 'tween' }}
      >
        <img
          src={HERO_BG_URL}
          alt="Hero Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />
      </motion.div>

      {/* Content */}
      <div className="container relative z-10 px-4 md:px-0">
        <motion.div
          className="max-w-4xl mx-auto text-center space-y-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, type: 'tween' }}
        >
          {/* Icon */}
          <motion.div
            className="flex justify-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3, type: 'tween' }}
          >
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-card/50 backdrop-blur-md border border-border flex items-center justify-center p-4">
              <img src={ICON_URL} alt="Google Telegram Integration" className="w-full h-full" />
            </div>
          </motion.div>

          {/* Main Heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, type: 'tween' }}
          >
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              구글 생태계 +{" "}
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                텔레그램
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-foreground/70 mt-6">
              양방향 통합 플랫폼
            </p>
          </motion.div>

          {/* Description */}
          <motion.p
            className="text-lg text-foreground/60 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5, type: 'tween' }}
          >
            구글 워크스페이스 서비스(Gmail, Calendar, Drive, Sheets, Tasks)와 텔레그램 간의 원활한 실시간 통신을 위한 종합 설계 명세서입니다.
            자연어 처리, 상태 관리, 양방향 데이터 흐름을 특징으로 합니다.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col md:flex-row gap-4 justify-center pt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, type: 'tween' }}
          >
            <Button
              size="lg"
              className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg font-semibold"
              onClick={() => (window.location.href = "/chat")}
            >
              AI 채팅 시작 💬
            </Button>
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-semibold"
              onClick={() => {
                const element = document.getElementById("architecture");
                element?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              아키텍처 탐색 →
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-lg font-semibold"
              onClick={() => {
                const element = document.getElementById("overview");
                element?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              문서 보기
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            className="grid grid-cols-3 gap-4 md:gap-8 pt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            {[
              { label: "API 연동", value: "5" },
              { label: "대화 상태", value: "6" },
              { label: "서비스", value: "3+" },
            ].map((stat, index) => (
              <motion.div
                key={index}
                className="text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
              >
                <div className="text-2xl md:text-3xl font-bold text-accent mb-1">
                  {stat.value}
                </div>
                <div className="text-xs md:text-sm text-foreground/60">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
