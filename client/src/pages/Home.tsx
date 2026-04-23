import { useState } from "react";
import { motion } from "framer-motion";
import { Menu, X, Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import Sidebar from "@/components/Sidebar";
import HeroSection from "@/components/HeroSection";
import OverviewSection from "@/components/OverviewSection";
import ArchitectureSection from "@/components/ArchitectureSection";
import FeaturesSection from "@/components/FeaturesSection";
import TechStackSection from "@/components/TechStackSection";
import ConversationFlowSection from "@/components/ConversationFlowSection";
import SecuritySection from "@/components/SecuritySection";
import RoadmapSection from "@/components/RoadmapSection";
import CodeExamplesSection from "@/components/CodeExamplesSection";
import APIReferenceSection from "@/components/APIReferenceSection";
import WorkspaceWidgets from "@/components/home/WorkspaceWidgets"; // MODIFIED: add workstation summary widgets below existing home content.
import FooterSection from "@/components/FooterSection";

/**
 * Modern Tech Minimalist Design
 * - Deep Slate background with Cyan/Blue accents
 * - Asymmetric layout with left sidebar navigation
 * - Interactive diagrams and smooth animations
 * - Geist Sans typography for headings, Inter for body
 */
export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, loading, error, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile Menu Button */}
      <motion.div
        className="fixed top-4 right-4 z-50 flex gap-2 md:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-full"
        >
          {sidebarOpen ? (
            <X className="w-4 h-4" />
          ) : (
            <Menu className="w-4 h-4" />
          )}
        </Button>
      </motion.div>

      {/* Sidebar Navigation */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="md:ml-64 transition-all duration-300">
        {/* Header with Theme Toggle (Desktop) */}
        <motion.header
          className="fixed top-0 right-0 left-0 md:left-64 h-16 bg-background/80 backdrop-blur-md border-b border-border z-40 flex items-center justify-between px-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Google ↔ Telegram
          </h1>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            className="rounded-full hidden md:flex"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
        </motion.header>

        {/* Content Sections */}
        <div className="pt-16">
          <HeroSection />
          <OverviewSection />
          <ArchitectureSection />
          <FeaturesSection />
          <ConversationFlowSection />
          <TechStackSection />
          <CodeExamplesSection />
          <APIReferenceSection />
          <SecuritySection />
          <RoadmapSection />
          <WorkspaceWidgets /> {/* MODIFIED: append new dashboard widgets without removing existing sections. */}
          <FooterSection />
        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
