# Supabase Dev vs Prod Strategy

Development:
- Email confirmation: OFF
- Magic links: OFF
- Fake emails allowed
- No transactional email sending

Production:
- Email confirmation: ON
- Custom SMTP provider
- Rate limits enabled

Environment separation:
- .env.development
- .env.production

App must select Supabase config based on EXPO_PUBLIC_ENV.
