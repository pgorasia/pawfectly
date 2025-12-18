# 🐾 Pawfectly

**Dog-first connections. Friends, playdates, or something more — led by your pup.**

Pawfectly is a mobile app where dogs come first. Users connect through their dogs to find:

- 🐕 **Pawsome Pals** (dog friends & playdates)
- ❤️ **Pawfect Match** (dating, dog-approved)

No dating pressure. No awkwardness. Dogs lead, humans follow.

## ✨ Core Principles

- **Dog happiness > human intent**
- One Primary Dog drives matching
- Multiple dogs supported per user
- Clear intent separation (friends vs dating)
- Location-based, real-world connections
- Safety, warmth, and trust by design

## 🧱 Tech Stack

### Frontend
- React Native (Expo)
- TypeScript

### Backend
- Supabase (PostgreSQL, Auth, Realtime, Storage)
- PostGIS for location queries

### AI (Development)
- Cursor IDE
- Claude 3.5 Sonnet

## 🗂 Folder Structure

```plaintext
/src
 ├─ app
 │   ├─ auth
 │   ├─ onboarding
 │   ├─ profile
 │   ├─ dogs
 │   ├─ feed
 │   ├─ matches
 │   ├─ chat
 │   ├─ notifications
 │   └─ settings
 ├─ components
 │   ├─ FeedCard.tsx
 │   ├─ DogBadge.tsx
 │   ├─ CompatibilityMeter.tsx
 │   └─ VerifiedBadge.tsx
 ├─ services
 │   ├─ supabase.ts
 │   ├─ matching.ts
 │   └─ location.ts
 ├─ hooks
 ├─ utils
 └─ types
```

## 🧠 Matching Logic (MVP)

- **Only Primary Dog used for compatibility**
- **Compatibility score (0–100)**:
  - **Size**: 30%
  - **Energy**: 30%
  - **Temperament**: 25%
  - **Age**: 15%
- **Distance** and **recent activity** are prioritized.

## 💰 Monetization

### Free
- Swiping
- Messaging
- One primary dog
- Basic filters

### Top Dog (Premium)
- See who liked you
- Undo & revisit swipes
- Advanced dog filters
- Profile boosts

## 🔐 Safety & Trust

- Mandatory dog photo
- Optional human+dog photo
- Reporting & blocking
- AI-assisted moderation
- Dog-first language everywhere


## 🚀 Development Order

1. **Auth & User Profile**
2. **Dog Management (multi-dog)**
3. **Feed & Swiping**
4. **Matches & Chat**
5. **Notifications & Premium**
