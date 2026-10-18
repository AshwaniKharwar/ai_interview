export interface User {
  id: string;
  email: string;
  full_name: string | null;
  picture_url: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface MessageResponse {
  message: string;
}

export interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  setSessionFromTokens: (tokens: TokenResponse) => Promise<void>;
  refreshSession: () => Promise<boolean>;
}
