# Authentication Setup Guide

## Supabase Configuration

### 1. Email Confirmation (Dev Mode)

For frictionless development, disable email confirmation in Supabase:

1. Go to Supabase Dashboard → Authentication → Settings
2. Under "Email Auth", disable "Enable email confirmations"
3. This allows signup without email verification in dev

### 2. Google OAuth Setup

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Add your OAuth credentials:
   - Client ID (from Google Cloud Console)
   - Client Secret (from Google Cloud Console)
4. Add redirect URLs:
   - For Expo: `exp://localhost:8081` (dev) or your app's deep link
   - For web: `http://localhost:8081/auth/callback` (dev) or your production URL

### 3. Redirect URLs Configuration

In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: Your app's base URL
- Redirect URLs: Add all possible redirect URLs (dev, staging, production)

## Auth Flow

1. **Welcome Screen** → User taps "Get Started" → Navigates to `/auth`
2. **Auth Screen** → User signs up/signs in → On success, navigates to `/(profile)/dogs`
3. **Protected Routes** → All `/profile/*` routes are guarded by `ProtectedRoute` component
4. **Session Persistence** → AuthContext automatically loads and persists session

## Testing

- Email/Password: Works immediately after setup
- Google OAuth: Requires proper redirect URL configuration
- Session persistence: Session is automatically restored on app restart

