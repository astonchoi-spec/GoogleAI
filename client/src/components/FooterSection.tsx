import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Github, Mail, ExternalLink } from "lucide-react";

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

export default function FooterSection() {
  return (
    <footer className="py-20 md:py-32 px-4 md:px-0 bg-secondary/30 border-t border-border">
      <div className="container">
        <motion.div
          className="max-w-5xl mx-auto space-y-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          {/* Main Footer Content */}
          <motion.div
            className="grid md:grid-cols-3 gap-8"
            variants={containerVariants}
          >
            {/* About */}
            <motion.div variants={itemVariants} className="space-y-4">
              <h3 className="text-lg font-bold">Google ↔ Telegram</h3>
              <p className="text-sm text-foreground/60 leading-relaxed">
                A comprehensive design specification for seamless bidirectional integration
                between Google Workspace and Telegram, powered by natural language processing
                and intelligent automation.
              </p>
            </motion.div>

            {/* Quick Links */}
            <motion.div variants={itemVariants} className="space-y-4">
              <h4 className="font-semibold">Documentation</h4>
              <ul className="space-y-2 text-sm">
                {[
                  { label: "Architecture", id: "architecture" },
                  { label: "Features", id: "features" },
                  { label: "Tech Stack", id: "tech" },
                  { label: "보안", id: "security" },
                ].map((link) => (
                  <li key={link.id}>
                    <button
                      onClick={() => {
                        const element = document.getElementById(link.id);
                        element?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="text-foreground/60 hover:text-accent transition-colors flex items-center gap-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Contact */}
            <motion.div variants={itemVariants} className="space-y-4">
              <h4 className="font-semibold">Get in Touch</h4>
              <div className="space-y-3 text-sm">
                <a
                  href="mailto:contact@example.com"
                  className="text-foreground/60 hover:text-accent transition-colors flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  contact@example.com
                </a>
                <a
                  href="#"
                  className="text-foreground/60 hover:text-accent transition-colors flex items-center gap-2"
                >
                  <Github className="w-4 h-4" />
                  GitHub Repository
                </a>
              </div>
            </motion.div>
          </motion.div>

          {/* Divider */}
          <motion.div
            className="h-px bg-gradient-to-r from-transparent via-border to-transparent"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            transition={{ duration: 0.8 }}
          />

          {/* Tech Stack Summary */}
          <motion.div variants={itemVariants} className="space-y-6">
            <h3 className="text-lg font-bold">Technology Highlights</h3>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { label: "FastAPI", desc: "백엔드 프레임워크" },
                { label: "Gemini API", desc: "NLU 엔진" },
                { label: "Cloud Run", desc: "인프라" },
                { label: "Firestore", desc: "데이터베이스" },
              ].map((tech, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="group"
                >
                  <Card className="p-4 border border-border/50 hover:border-primary/50 transition-all duration-300 bg-card/50 backdrop-blur-sm text-center">
                    <div className="font-semibold text-sm text-primary group-hover:text-accent transition-colors">
                      {tech.label}
                    </div>
                    <div className="text-xs text-foreground/60 mt-1">{tech.desc}</div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Bottom Section */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-foreground/60"
          >
            <div>
              <p>Google Ecosystem + Telegram Bidirectional Integration Platform</p>
              <p className="mt-1">Design Specification v1.0</p>
            </div>
            <div className="flex items-center gap-4">
              <span>© 2026 All Rights Reserved</span>
              <a href="#" className="hover:text-accent transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-accent transition-colors">
                Terms of Service
              </a>
            </div>
          </motion.div>

          {/* Scroll to Top */}
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="px-6 py-2 rounded-lg border border-border hover:border-accent text-sm font-medium text-foreground/70 hover:text-accent transition-all duration-300 hover:bg-accent/5"
            >
              Back to Top
            </button>
          </motion.div>
        </motion.div>
      </div>
    </footer>
  );
}
