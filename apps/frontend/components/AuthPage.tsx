/**
 * Authentication page for sign-in and sign-up.
 *
 * Renders a centered card with email/password fields (and name for sign-up).
 * On successful sign-in, the server sets an httpOnly cookie.
 * The frontend fetches a short-lived WS token separately when needed.
 * Redirects to `?next=` when provided; otherwise sends the user to `/`
 * so they see their existing rooms and can choose to open or create one.
 * On successful sign-up, auto-signs-in and redirects the same way.
 *
 * Displays server-side validation errors inline.
 *
 * @param isSignin - If `true`, renders the sign-in form; otherwise sign-up
 */

"use client";

import { HTTP_BACKEND } from "@/config";
import axios, { isAxiosError } from "axios";
import { Pencil } from "lucide-react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "./ui";

export function AuthPage({ isSignin }: { isSignin: boolean }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const { search } = useLocation();
    const searchParams = new URLSearchParams(search);
    const next = searchParams.get("next");

    /** Redirect target after auth — only allow same-app paths (no open redirect) */
    const redirectTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

    const [error, setError] = useState("");

    /** Submit credentials to the HTTP backend and handle success/error */
    async function handleClick() {
        setError("");

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            setError("Enter a valid email address.");
            return;
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (!isSignin && !name.trim()) {
            setError("Enter your name.");
            return;
        }

        try {
            await axios.post(
                `${HTTP_BACKEND}/${isSignin ? "signin" : "signup"}`,
                {
                    email,
                    password,
                    name,
                },
                { withCredentials: true },
            );

            if (isSignin) {
                navigate({ to: redirectTo });
            } else {
                try {
                    await axios.post(
                        `${HTTP_BACKEND}/signin`,
                        { email, password },
                        { withCredentials: true },
                    );
                    navigate({ to: redirectTo });
                } catch {
                    navigate({ to: "/signin" });
                }
            }

        } catch (e: unknown) {
            if (isAxiosError<{ message?: string }>(e)) {
                const serverMsg = e.response?.data?.message;
                const fallback = isSignin
                    ? "Couldn't sign in. Check your email and password."
                    : "Couldn't create account. Check your details and try again.";
                const msg = serverMsg || fallback;

                console.error(
                    "Auth error:",
                    e.response?.status,
                    e.response?.data,
                    e.message
                );

                setError(msg);
            } else {
                console.error("Auth error:", e);
                setError("Something went wrong");
            }
        }
    }

    return (
        <div role="main" className="flex justify-center items-center w-screen h-screen bg-canvas dark:bg-canvas-dark">
            <form
                aria-label={isSignin ? "Sign in" : "Sign up"}
                className="w-full max-w-sm p-6 m-2 rounded-lg border border-border dark:border-border-dark bg-elevated dark:bg-elevated-dark shadow-soft dark:shadow-float-dark text-foreground dark:text-foreground-dark animate-panel-in motion-reduce:animate-none"
                onSubmit={(e) => { e.preventDefault(); handleClick(); }}
            >
                <h1 className="sr-only">{isSignin ? "Sign in to CoDraw" : "Create a CoDraw account"}</h1>
                <div className="flex items-center justify-center gap-2 pb-4">
                    <span className="flex items-center justify-center w-8 h-8 -rotate-6 border border-border dark:border-border-dark rounded-md bg-muted dark:bg-muted-dark">
                        <Pencil className="w-4 h-4 text-primary" />
                    </span>
                    <span className="font-mono font-semibold text-lg tracking-tight text-foreground dark:text-foreground-dark">CoDraw</span>
                </div>
                <div className="p-2">
                    <Input
                        type="email"
                        aria-label="Email"
                        placeholder="Email"
                        value={email}
                        required
                        autoComplete="email"
                        onChange={setEmail}
                        size="md"
                    />
                </div>
                {!isSignin && (
                    <div className="p-2">
                        <Input
                            type="text"
                            aria-label="Name"
                            placeholder="Name"
                            value={name}
                            required
                            onChange={setName}
                            size="md"
                        />
                    </div>
                )}
                <div className="p-2">
                    <Input
                        type="password"
                        aria-label="Password"
                        placeholder="Password (min 6 characters)"
                        value={password}
                        required
                        minLength={6}
                        autoComplete={isSignin ? "current-password" : "new-password"}
                        onChange={setPassword}
                        size="md"
                    />
                </div>
                {error && <p className="p-2 text-danger dark:text-danger-dark text-sm">{error}</p>}
                <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-accent-hover dark:hover:bg-accent-hover-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                        {isSignin ? "Sign in" : "Sign up"}
                    </button>
                </div>
            </form>
        </div>
    );
}
