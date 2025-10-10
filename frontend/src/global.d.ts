
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: any) => void; ux_mode?: string; auto_select?: boolean; cancel_on_tap_outside?: boolean; }) => void;
          renderButton: (parent: HTMLElement, options: {
            type?: 'standard' | 'icon';
            theme?: 'outline' | 'filled_blue' | 'filled_black';
            size?: 'large' | 'medium' | 'small';
            text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
            shape?: 'rectangular' | 'pill' | 'circle' | 'square';
            logo_alignment?: 'left' | 'center';
            width?: string; // e.g., '250px'
            locale?: string;
            click_listener?: () => void;
          }) => void;
          prompt: (notification?: (promptNotification: any) => void) => void;
          disableAutoSelect: () => void;
          storeCredential: (credential: string, callback?: () => void) => void;
          cancel: () => void;
          // Add other GSI V2 methods if used, e.g.
          // signOut: (options: { callback: () => void }) => void;
          // revoke: (idHint: string, options: { callback: () => void }) => void;
        };
      };
    };
  }
}

// Export {} to ensure this file is treated as a module by TypeScript,
// which is good practice for .d.ts files, especially when extending global scope.
export {};
