"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AlertCircle, Loader2 } from "lucide-react";

function LoginContent() {
  const { loginWithGoogle, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const errorMessage = searchParams.get("error");

  const handleGoogleSignIn = () => {
    setIsRedirecting(true);
    loginWithGoogle();
  };

  const isButtonDisabled = authLoading || isRedirecting;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl border border-gray-100 dark:border-gray-800 dark:bg-gray-800">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            AI Interview System
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign in to continue to your interview dashboard
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium">Authentication Failed</p>
              <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isButtonDisabled}
            aria-busy={isRedirecting}
            className="relative flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-650"
          >
            {isRedirecting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                <span>Redirecting to Google...</span>
              </>
            ) : (
              <>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          By signing in, you agree to our terms of service and privacy policy.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
