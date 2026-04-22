import { motion } from "framer-motion";
import { Link } from "wouter";
import { ChevronRight, MessageCircle, LayoutGrid } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { label: "개요", id: "overview" },
  { label: "아키텍처", id: "architecture" },
  { label: "기능", id: "features" },
  { label: "대화 흐름", id: "flow" },
  { label: "기술 스택", id: "tech" },
  { label: "구연 예제", id: "code" },
  { label: "API 참조", id: "api" },
  { label: "보안", id: "security" },
  { label: "로드맥", id: "roadmap" },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const handleNavClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      onClose();
    }
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside
        className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-col p-6 z-40"
        initial={{ x: -256 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Logo */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            GoogleTG
          </h2>
          <p className="text-sm text-sidebar-foreground/60 mt-1">
            Integration Design
          </p>
        </motion.div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {navItems.map((item, index) => (
            <motion.button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group flex items-center justify-between"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              whileHover={{ x: 4 }}
            >
              <span>{item.label}</span>
              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
          ))}
        </nav>

        {/* Chat & Google Links */}
        <motion.div
          className="pt-4 border-t border-sidebar-border space-y-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Link href="/chat">
            <a className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary/10 hover:bg-primary/20 text-primary transition-colors">
              <MessageCircle className="w-4 h-4" />
              AI 채팅
            </a>
          </Link>
          <Link href="/google">
            <a className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors">
              <LayoutGrid className="w-4 h-4" />
              Google Workspace
            </a>
          </Link>
        </motion.div>

        {/* Footer */}
        <motion.div
          className="pt-4 text-xs text-sidebar-foreground/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p>Google Ecosystem +</p>
          <p>Telegram Integration</p>
        </motion.div>
      </motion.aside>

      {/* Mobile Sidebar */}
      <motion.aside
        className="fixed left-0 top-0 h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col p-6 z-40 md:hidden"
        initial={{ x: isOpen ? 0 : -256 }}
        animate={{ x: isOpen ? 0 : -256 }}
        transition={{ duration: 0.3 }}
      >
        {/* Logo */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            GoogleTG
          </h2>
          <p className="text-sm text-sidebar-foreground/60 mt-1">
            Integration Design
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className="w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Chat & Google Links */}
        <div className="pt-4 border-t border-sidebar-border space-y-2">
          <Link href="/chat">
            <a
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
              onClick={onClose}
            >
              <MessageCircle className="w-4 h-4" />
              AI 채팅
            </a>
          </Link>
          <Link href="/google">
            <a
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
              onClick={onClose}
            >
              <LayoutGrid className="w-4 h-4" />
              Google Workspace
            </a>
          </Link>
        </div>

        {/* Footer */}
        <div className="pt-4 text-xs text-sidebar-foreground/60">
          <p>Google Ecosystem +</p>
          <p>Telegram Integration</p>
        </div>
      </motion.aside>
    </>
  );
}
