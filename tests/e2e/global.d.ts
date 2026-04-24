export {};

declare global {
  interface Window {
    __swiftVoiceEmitError: (error: string) => void;
    __swiftVoiceEmitResult: (segments: string[]) => void;
  }
}
