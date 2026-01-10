# Chat Screen Tabs Implementation

## Overview
Implemented Hinge-style two-tab layout for the chat screen: **Chat** and **Profile**.

## Changes Made

### 1. Chat Screen (`app/messages/[conversationId].tsx`)

#### Tab System
- Added two tabs: **Chat** and **Profile**
- Tabs displayed below the header with visual indicator for active tab
- Simple header with just the display name (removed thumbnail/tap-to-navigate)

#### Chat Tab
- **Auto-focus**: Text input automatically receives focus when Chat tab is active
- **Keyboard**: Opens automatically on focus (300ms delay for smooth mounting)
- Uses `useFocusEffect` to trigger focus when returning to the screen
- Full message list and input preserved from previous implementation

#### Profile Tab
- **Read-only**: Displays full profile using `FullProfileView` component
- **No actions**: Heart buttons on photos/prompts are hidden
- **Lazy loading**: Profile data fetched only when Profile tab is first opened
- **Cached**: Once loaded, profile data persists during the session

#### Key Features Preserved
- First message detection (moves conversation from Matches to Messages)
- Optimistic message sending
- Error handling with retry
- Overflow menu (Unmatch, Block, Report)

### 2. FullProfileView Component (`components/profile/FullProfileView.tsx`)

#### Added Read-Only Mode
- New optional prop: `readOnly?: boolean`
- Updated `onHeartPress` to be optional
- When `readOnly={true}`:
  - Heart buttons not rendered on photos
  - Heart buttons not rendered on prompts
  - Profile displays normally without action buttons

#### Modified Components
- **PhotoTile**: `onHeartPress` now optional, heart button conditionally rendered
- **PromptTile**: `onHeartPress` now optional, heart button conditionally rendered

## User Experience

### Navigation Flow
1. User taps on a match or message thread
2. Chat screen opens with **Chat tab active**
3. Text input auto-focused, keyboard opens
4. User can tap **Profile tab** to view full profile
5. Profile loads and displays without action buttons

### Chat Tab UX
- Immediate focus on text input
- Keyboard opens automatically
- Ready to type instantly
- No need to tap input field

### Profile Tab UX
- Full scrollable profile view
- All photos, prompts, and dog details visible
- No heart buttons or swipe actions
- Clean, read-only viewing experience

## Technical Details

### Auto-Focus Implementation
```typescript
useFocusEffect(
  useCallback(() => {
    if (activeTab === 'chat') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab])
);
```

### Profile Loading Strategy
- Lazy: Only loads when Profile tab is tapped
- Cached: Once loaded, data persists
- Shows loading spinner during fetch
- Defensive: Handles errors gracefully

### Read-Only Profile
```typescript
<FullProfileView 
  payload={profileData} 
  readOnly={true} 
/>
```

## Files Modified
1. `app/messages/[conversationId].tsx` - Main chat screen
2. `components/profile/FullProfileView.tsx` - Profile component

## Testing Checklist
- [ ] Chat tab auto-focuses text input on load
- [ ] Keyboard opens automatically on Chat tab
- [ ] Profile tab displays full profile
- [ ] Profile tab has no heart buttons
- [ ] Switching between tabs preserves state
- [ ] Messages persist when switching tabs
- [ ] Input text preserved when switching tabs
- [ ] First message detection still works
- [ ] Overflow menu (Unmatch/Block/Report) accessible from both tabs
