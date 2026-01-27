import { z } from "zod";

// Shared schemas
export const emailSchema = z.string().email("Please enter a valid email address.");
export const passwordSchema = z.string().min(6, "Password must be at least 6 characters.");
export const usernameSchema = z.string().min(3, "Username must be at least 3 characters.");

// Sign In Schema
export const signInSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});

export type SignInPayload = z.infer<typeof signInSchema>;

// Sign Up Schema
export const signUpSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    username: usernameSchema,
});

export type SignUpPayload = z.infer<typeof signUpSchema>;
