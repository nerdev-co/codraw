/**
 * Signs the current user out (POST /auth/logout clears the httpOnly cookie)
 * and returns them to the guest home page.
 */

"use client";

import { HTTP_BACKEND } from "@/config";
import { useNavigate } from "@tanstack/react-router";
import axios from "axios";
import { useState } from "react";

export function SignOutButton() {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);

    async function handleClick() {
        setBusy(true);
        try {
            await axios.post(`${HTTP_BACKEND}/auth/logout`, {}, { withCredentials: true });
        } catch (err) {
            console.error("Sign out request failed", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
        navigate({ to: "/" });
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={busy}
            className="px-3 py-1.5 font-mono text-sm border border-border dark:border-border-dark rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-colors duration-fast hover:border-primary hover:text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
            {busy ? "signing out…" : "sign out"}
        </button>
    );
}
