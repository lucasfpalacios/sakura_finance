// Tipos mínimos de Google Identity Services (https://accounts.google.com/gsi/client)
interface GoogleCredentialResponse {
  credential: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (res: GoogleCredentialResponse) => void;
          auto_select?: boolean;
        }) => void;
        renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        disableAutoSelect: () => void;
      };
    };
  };
}
