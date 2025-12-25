import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "../../lib/utils";
import React from "react";

interface CardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    className?: string;
    variant?: "glass" | "neon" | "solid";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ children, className, variant = "glass", ...props }, ref) => {
        const variants = {
            glass: "bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl hover:border-white/20",
            neon: "bg-black/40 border border-primary/50 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_25px_rgba(139,92,246,0.3)]",
            solid: "bg-surface border border-white/5",
        };

        return (
            <motion.div
                ref={ref}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={cn(
                    "rounded-3xl p-6 transition-all duration-300",
                    variants[variant],
                    className
                )}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);

Card.displayName = "Card";
