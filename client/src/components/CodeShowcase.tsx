import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface CodeShowcaseProps {
  title: string;
  description: string;
  code: string;
  language?: string;
}

export default function CodeShowcase({
  title,
  description,
  code,
  language = "python",
}: CodeShowcaseProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-4"
    >
      <div>
        <h4 className="font-semibold text-lg mb-2">{title}</h4>
        <p className="text-sm text-foreground/60">{description}</p>
      </div>

      <Card className="relative border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden group">
        {/* Copy Button */}
        <motion.button
          onClick={handleCopy}
          className="absolute top-4 right-4 p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-all duration-200 z-10 opacity-0 group-hover:opacity-100"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {copied ? (
            <Check className="w-4 h-4 text-accent" />
          ) : (
            <Copy className="w-4 h-4 text-foreground/60" />
          )}
        </motion.button>

        {/* Code Block */}
        <pre className="p-6 overflow-x-auto text-sm font-mono leading-relaxed">
          <code className="text-foreground/80">{code}</code>
        </pre>
      </Card>
    </motion.div>
  );
}
