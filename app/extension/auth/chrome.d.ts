// Minimal ambient chrome.runtime typing for the /extension/auth relay page.
// The web app does not depend on @types/chrome; this declaration provides
// just enough surface for the relay page to typecheck. The full extension
// build (extension/tsconfig.json) uses @types/chrome instead.

declare global {
  interface ChromeRuntimeSendMessageResponse {
    ok?: boolean;
    error?: string;
  }

  interface ChromeRuntimeLastError {
    message: string;
  }

  interface ChromeRuntime {
    sendMessage(
      extensionId: string,
      message: unknown,
      callback: (response: ChromeRuntimeSendMessageResponse) => void
    ): void;
    lastError: ChromeRuntimeLastError | null;
  }

  interface ChromeRuntimeGlobal {
    runtime: ChromeRuntime;
  }

  const chrome: ChromeRuntimeGlobal;
}

export {};
