# Messages Module - Test Checklist

## Overview
Complete test checklist for the Pawfectly Messages module implementation.

## Setup
1. Ensure Supabase RPCs are deployed:
   - `public.get_messages_home(p_limit int)`
   - `public.get_incoming_requests(p_limit int)`
2. Start Expo development server: `npx expo start`
3. Open app on iOS simulator, Android emulator, or Expo Go

---

## Test Cases

### 1. Initial Load & Caching

#### 1.1 First Load
- [ ] Navigate to Messages tab
- [ ] Loading spinner appears immediately
- [ ] Data loads within 2-3 seconds (depending on network)
- [ ] All sections render correctly

#### 1.2 Stale-While-Revalidate (SWR) Cache
- [ ] Navigate away from Messages tab
- [ ] Navigate back to Messages tab
- [ ] **Expected:** Cached data appears INSTANTLY (< 100ms)
- [ ] Background refresh happens silently
- [ ] No loading spinner on subsequent visits (if cache < 1 minute old)

#### 1.3 Pull-to-Refresh
- [ ] Pull down on Messages screen
- [ ] Refresh indicator appears
- [ ] Data reloads from server
- [ ] Screen updates with fresh data
- [ ] Refresh indicator disappears

---

### 2. Lane Filter (All / Pals / Match)

#### 2.1 Filter Interaction
- [ ] Tap "All" button → button highlights with primary color
- [ ] Tap "Pals" button → button highlights, "All" unhighlights
- [ ] Tap "Match" button → button highlights, others unhighlight
- [ ] Filter changes are instant (no loading spinner)
- [ ] **Critical:** No network requests when switching filters

#### 2.2 Filter Behavior - Matches Section
- [ ] "All" shows both Pals and Match matches
- [ ] "Pals" shows only matches where `lane='pals'`
- [ ] "Match" shows only matches where `lane='match'`
- [ ] Lane badges on match tiles show correct emoji (🐾 for Pals, 💛 for Match)

#### 2.3 Filter Behavior - Messages List
- [ ] "All" shows all threads (both lanes)
- [ ] "Pals" filters to only `lane='pals'` threads
- [ ] "Match" filters to only `lane='match'` threads
- [ ] Unread count badge updates correctly based on filtered threads

#### 2.4 Filter Behavior - Requests List
- [ ] Switch to "Requests" tab
- [ ] "All" shows all incoming requests
- [ ] "Pals" filters to only Pals requests
- [ ] "Match" filters to only Match requests
- [ ] Request count in tab label updates correctly

#### 2.5 Filter Behavior - Sent Requests
- [ ] Sent Requests section only appears when count > 0 AFTER filtering
- [ ] Filtering correctly hides/shows Sent Requests section
- [ ] "All" shows all sent requests
- [ ] "Pals"/"Match" filters correctly

---

### 3. Matches Section

#### 3.1 Matches Display
- [ ] Matches appear in horizontal scrollable row
- [ ] Hero photo loads correctly (or shows initials placeholder)
- [ ] Display name appears below avatar
- [ ] Lane badge shows in bottom-right corner of avatar
- [ ] Tap match tile navigates to profile (read-only mode)

#### 3.2 Empty State - With Liked You Count
- [ ] Filter to show 0 matches (e.g., set to "Pals" with no Pals matches)
- [ ] Ensure `liked_you_count > 0` in backend data
- [ ] **Expected:** Placeholder card appears:
  - Shows count: "X people want to connect with you"
  - Shows "View their profiles →" subtitle
  - Has favorite icon
- [ ] Tap placeholder card navigates to `/liked-you` tab

#### 3.3 Empty State - No Liked You
- [ ] Filter to show 0 matches
- [ ] Ensure `liked_you_count = 0`
- [ ] **Expected:** Matches section does not render at all (no placeholder)

---

### 4. Sent Requests Section

#### 4.1 Display Behavior
- [ ] Section appears ONLY when `sent_requests.length > 0` after filtering
- [ ] Section title: "SENT REQUESTS" (uppercase, small, muted)
- [ ] Horizontal scrollable row
- [ ] Compact pill-style tiles with avatar + name + "Pending" status

#### 4.2 Visibility with Filters
- [ ] "All" filter: shows all sent requests
- [ ] "Pals" filter: only Pals sent requests (or hidden if count = 0)
- [ ] "Match" filter: only Match sent requests (or hidden if count = 0)

#### 4.3 Interaction
- [ ] Tap sent request tile navigates to conversation/thread

---

### 5. Messages Tab

#### 5.1 Tab Interaction
- [ ] "Messages" tab is selected by default (underline indicator)
- [ ] Tap "Messages" tab → stays selected (idempotent)
- [ ] Unread count badge shows if totalUnreadCount > 0
- [ ] Badge disappears when unread count = 0

#### 5.2 Thread List Display
- [ ] Threads appear in vertical list
- [ ] Each row shows:
  - Avatar (photo or initials placeholder)
  - Display name
  - Lane badge (emoji)
  - Time ago (e.g., "30m", "4d")
  - Preview text (1 line, ellipsis)
  - Unread badge (if unread_count > 0)
- [ ] Unread threads have bold text
- [ ] Read threads have normal weight text

#### 5.3 Thread Interaction
- [ ] Tap thread row navigates to `/chat/{conversationId}`
- [ ] Tapping preserves navigation stack (back button works)

#### 5.4 Empty State
- [ ] With no threads (after filtering):
  - "No messages yet" text appears
  - Subtext: "Start chatting with your matches!" (or filtered lane message)

---

### 6. Requests Tab

#### 6.1 Tab Interaction
- [ ] Tap "Requests" tab → tab becomes active
- [ ] Tab label shows count when > 0: "X Requests"
- [ ] Tab label shows "Requests" when count = 0
- [ ] No network request when switching tabs (data already loaded)

#### 6.2 Request List Display
- [ ] Requests appear in vertical list
- [ ] Each row shows:
  - Avatar
  - Display name
  - Lane badge
  - Time ago
  - Preview text (2 lines max)
- [ ] No unread badge (requests are always "unread" by nature)

#### 6.3 Request Interaction
- [ ] Tap request row navigates to `/requests/{conversationId}`

#### 6.4 Empty State
- [ ] With no requests (after filtering):
  - "No requests" text appears
  - Subtext explains filtered state

---

### 7. Performance Tests

#### 7.1 No Redundant Network Calls
- [ ] Open Messages screen
- [ ] Observe network tab (React Native Debugger or Charles Proxy)
- [ ] Initial load: 2 RPC calls (`get_messages_home`, `get_incoming_requests`)
- [ ] Switch lane filter: **0 network calls**
- [ ] Switch Messages/Requests tab: **0 network calls**
- [ ] Navigate away and back (within 1 min): **0 network calls** (uses cache)
- [ ] Pull-to-refresh: 2 RPC calls (expected)

#### 7.2 Smooth Scrolling
- [ ] Horizontal scroll in Matches row is smooth (60 FPS)
- [ ] Horizontal scroll in Sent Requests row is smooth
- [ ] Vertical scroll in Messages/Requests list is smooth
- [ ] No jank when switching filters
- [ ] No jank when switching tabs

---

### 8. Error Handling

#### 8.1 Network Error on Initial Load
- [ ] Disconnect network / enable Airplane Mode
- [ ] Open Messages screen
- [ ] **Expected:**
  - Loading spinner appears
  - After timeout, error banner appears at top
  - Banner shows: "Failed to load messages. Pull to refresh."
  - Screen does not crash
  - "Dismiss" button hides banner

#### 8.2 Network Error with Cached Data
- [ ] Load Messages screen successfully (data cached)
- [ ] Navigate away
- [ ] Disconnect network
- [ ] Navigate back to Messages
- [ ] **Expected:**
  - Cached data shows instantly
  - Background refresh fails silently (or shows error banner)
  - User can still browse cached data

#### 8.3 Partial Failures
- [ ] Mock `get_messages_home` to succeed, `get_incoming_requests` to fail
- [ ] **Expected:**
  - Messages data loads normally
  - Requests tab shows empty state (graceful degradation)
  - Error banner may appear but doesn't block UI

---

### 9. Edge Cases & Defensive Handling

#### 9.1 Missing Fields
- [ ] Mock data with missing `hero_storage_path` → shows initials placeholder
- [ ] Mock data with missing `display_name` → shows "?" placeholder
- [ ] Mock data with missing `preview` → shows fallback text
- [ ] Mock data with `null` values → no crashes

#### 9.2 Empty Arrays
- [ ] Mock `matches = []` → Matches section hidden (unless liked_you_count > 0)
- [ ] Mock `threads = []` → Empty state in Messages tab
- [ ] Mock `sent_requests = []` → Sent Requests section hidden
- [ ] Mock `requests = []` → Empty state in Requests tab

#### 9.3 Large Counts
- [ ] Mock `liked_you_count = 99` → Placeholder card shows "99 people want..."
- [ ] Mock `unread_count = 50` in a thread → Badge shows "50"
- [ ] Mock 100+ matches → Horizontal scroll works smoothly

---

### 10. Visual & UX Polish

#### 10.1 Styling
- [ ] Lane filter buttons have correct active/inactive states
- [ ] Tab underline indicator animates smoothly
- [ ] Colors match design system (primary, background, text)
- [ ] Spacing is consistent (uses Spacing constants)
- [ ] Typography uses AppText variants correctly

#### 10.2 Touchable Feedback
- [ ] All touchable elements have `activeOpacity={0.7}`
- [ ] Buttons provide visual feedback on press
- [ ] No accidental double-taps trigger duplicate navigation

#### 10.3 Dark Mode (if supported)
- [ ] Switch to dark mode
- [ ] All text is readable
- [ ] Lane filter buttons adapt colors
- [ ] Avatars and badges have correct contrast

---

## Known Limitations / TODOs
1. Profile navigation passes `mode=readonly` param - ensure profile screen honors this
2. Chat screen navigation (`/chat/{conversationId}`) - ensure route exists
3. Request detail screen navigation (`/requests/{conversationId}`) - stub or implement
4. Seen receipts not implemented (per spec, ignoring "seen" for now)
5. Double-check icon for sent message (single check) vs delivered (double check) - not fully implemented yet

---

## How to Test in Expo

### Dev Environment
```bash
# Start Expo dev server
npx expo start

# Press 'i' for iOS simulator
# Press 'a' for Android emulator
# Scan QR code for Expo Go on device
```

### Mock Data Testing
To test edge cases, temporarily modify `messagesService.ts`:
```typescript
export async function getMessagesHome(limit: number = 50): Promise<MessagesHomeResponse> {
  // Mock data for testing
  return {
    matches: [],
    threads: [],
    sent_requests: [],
    liked_you_count: 5, // Test placeholder card
  };
}
```

### Network Debugging
- Use React Native Debugger: `npx react-devtools`
- Enable network inspector
- Watch for RPC calls to `get_messages_home` and `get_incoming_requests`

---

## Success Criteria
✅ All sections filter correctly by lane without network calls  
✅ Cached data appears instantly on revisit  
✅ Pull-to-refresh works smoothly  
✅ No crashes with missing/null data  
✅ Error banner appears on failure but doesn't block UI  
✅ Smooth 60 FPS scrolling  
✅ Placeholder card shows when matches empty but liked_you_count > 0  
✅ Navigation to profile, chat, and requests works  

---

## Automated Testing (Future)
Consider adding:
- Jest unit tests for `filterByLane` logic
- React Native Testing Library tests for filter interactions
- E2E tests with Detox for full user flows
