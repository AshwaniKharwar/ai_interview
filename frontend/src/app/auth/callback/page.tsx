"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "@/lib/constants";
import { Loader2 } from "lucide-react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSessionFromTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    const tokenType = searchParams.get("token_type") || "bearer";
    const expiresInStr = searchParams.get("expires_in");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      router.replace(`${ROUTES.LOGIN}?error=${encodeURIComponent(errorParam)}`);
      return;
    }

    if (!accessToken || !refreshToken) {
      router.replace(`${ROUTES.LOGIN}?error=${encodeURIComponent("Missing authentication tokens")}`);
      return;
    }

    const expiresIn = expiresInStr ? parseInt(expiresInStr, 10) : 3600;

    setSessionFromTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: tokenType,
      expires_in: expiresIn,
    })
      .then(() => {
        router.replace(ROUTES.DASHBOARD);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to establish session";
        setError(msg);
        setTimeout(() => {
          router.replace(`${ROUTES.LOGIN}?error=${encodeURIComponent(msg)}`);
        }, 1500);
      });
  }, [searchParams, router, setSessionFromTokens]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-white p-8 shadow-md border border-gray-100 dark:border-gray-800 dark:bg-gray-800">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 dark:text-blue-400" />
        <div className="text-center">
          <p className="text-base font-medium text-gray-900 dark:text-white">
            {error ? "Authentication error" : "Authenticating..."}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error ? error : "Finalizing your sign in, redirecting to dashboard."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
