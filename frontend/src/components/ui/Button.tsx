import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "../../lib/utils";
import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends HTMLMotionProps<"button"> {
    children: React.ReactNode;
    variant?: "primary" | "secondary" | "ghost" | "destructive";
    size?: "sm" | "md" | "lg";
    isLoading?: boolean;
    className?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ children, variant = "primary", size = "md", isLoading, className, ...props }, ref) => {
        const variants = {
            primary: "bg-gradient-to-r from-primary via-purple-500 to-secondary text-white shadow-lg shadow-primary/20 hover:shadow-primary/40",
            secondary: "bg-white/10 text-white border border-white/10 hover:bg-white/20 backdrop-blur-md",
            ghost: "bg-transparent text-gray-300 hover:text-white hover:bg-white/5",
            destructive: "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20",
        };

        const sizes = {
            sm: "px-4 py-2 text-sm",
            md: "px-6 py-3 text-base",
            lg: "px-8 py-4 text-lg font-bold",
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={isLoading || props.disabled}
                className={cn(
                    "relative rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden",
                    variants[variant],
                    sizes[size],
                    (isLoading || props.disabled) && "opacity-50 cursor-not-allowed contrast-75",
                    className
                )}
                {...props}
            >
                {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                {children}
                {variant === 'primary' && (
                    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] animate-[shimmer_2s_infinite]" />
                )}
            </motion.button>
        );
    }
);

Button.displayName = "Button";
