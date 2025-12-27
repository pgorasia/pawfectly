# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.


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
