interface DesktopPrinter {
  list: () => Promise<Array<{ name: string; displayName: string; status: number; isDefault: boolean }>>;
  test: (printerName?: string) => Promise<{ success: boolean; reason: string | null }>;
  print: (request: { html: string; printerName?: string; silent?: boolean }) => Promise<{ success: boolean; reason: string | null }>;
}

interface Window {
  desktopPrinter?: DesktopPrinter;
  desktopRuntime?: {
    getStartupStatus: () => Promise<{ state: string; error?: string; credentials?: { email: string; password: string } }>;
  };
}