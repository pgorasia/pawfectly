# Lane Empty State Cards

## Overview

Consistent empty state cards for when either lane (Pals or Match) is exhausted, providing users with a clear action to find more connections.

## Render Conditions

The empty state card is shown when:
- `queueByLane[lane].length === 0`
- `exhaustedByLane[lane] === true`
- Not currently loading
- No current profile

## Content

### Title (Lane-Specific)

**Pals Lane:**
```
"No more Pawsome Pals nearby right now."
```

**Match Lane:**
```
"No more Pawfect Matches nearby right now."
```

### Actions

**Single Action Button:**
- **"Adjust filters"** → Navigates to Preferences screen
  - User can modify age range
  - User can change preferred genders
  - User can adjust distance radius
  - User can enable/disable connection styles

## Implementation

### Component Structure

```tsx
// Empty state for both lanes
<View style={styles.emptyContainer}>
  <AppText variant="heading" style={styles.emptyTitle}>
    {lane === 'pals' 
      ? 'No more Pawsome Pals nearby right now.'
      : 'No more Pawfect Matches nearby right now.'}
  </AppText>
  <View style={styles.emptyActionsContainer}>
    <AppButton
      variant="primary"
      onPress={() => router.push('/(profile)/preferences')}
      style={styles.emptyActionButton}
    >
      Adjust filters
    </AppButton>
  </View>
</View>
```

### Styles

```typescript
emptyContainer: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: Spacing.xl,
},
emptyTitle: {
  marginBottom: Spacing.md,
  textAlign: 'center',
},
emptyActionsContainer: {
  marginTop: Spacing.xl,
  width: '100%',
  maxWidth: 300,
  gap: Spacing.md,
},
emptyActionButton: {
  width: '100%',
},
```

## User Flow

### Scenario 1: Pals Exhausted
1. User exhausts Pals feed
2. Sees "No more Pawsome Pals nearby right now."
3. Taps "Adjust filters"
4. Navigates to Preferences screen
5. Can adjust:
   - Distance radius
   - Age range
   - Preferred genders
6. Returns to feed → new profiles appear

### Scenario 2: Match Exhausted
1. User exhausts Match feed
2. Sees "No more Pawfect Matches nearby right now."
3. Taps "Adjust filters"
4. Navigates to Preferences screen
5. Can adjust same filters as Pals
6. Returns to feed → new profiles appear

### Scenario 3: Switch Lanes Manually
1. User exhausts current lane
2. Can use segmented control to switch lanes
3. Other lane may have profiles (if enabled)
4. No automatic lane switching

## Future Enhancements

### Match Lane Empty State
Could add similar custom empty state for Match lane:
- "No more Pawfect Matches nearby"
- Same distance/filter actions
- "Try Pawsome Pals" button (if enabled)

### Additional Actions
- "Reset Passes" → Undo recent passes/rejects
- "Expand Age Range" → Directly opens age filter
- "See Who Liked You" → Premium feature

### Analytics
Track which action users take:
- `pals_empty_widen_radius`
- `pals_empty_adjust_filters`
- `pals_empty_switch_to_match`

### A/B Testing
- Test different button copy
- Test button order
- Test adding illustrations/icons

## Accessibility

- All buttons are keyboard accessible
- Screen reader announces empty state message
- Button labels are descriptive
- Proper focus management when navigating

## Testing

### Test Cases

1. **Pals Lane Exhausted:**
   - ✓ Shows "No more Pawsome Pals nearby right now."
   - ✓ Shows single "Adjust filters" button
   - ✓ Button navigates to Preferences
   - ✓ Returns to Pals lane after adjusting

2. **Match Lane Exhausted:**
   - ✓ Shows "No more Pawfect Matches nearby right now."
   - ✓ Shows single "Adjust filters" button
   - ✓ Button navigates to Preferences
   - ✓ Returns to Match lane after adjusting

3. **Lane Switching:**
   - ✓ User can manually switch lanes via segmented control
   - ✓ No automatic lane switching in empty state
   - ✓ Both lanes have consistent empty state design

4. **Loading States:**
   - ✓ Empty state doesn't show while loading
   - ✓ Empty state doesn't show while refilling
   - ✓ Empty state clears when new profiles loaded

## Design Rationale

### Simplicity
- Single clear action reduces decision paralysis
- "Adjust filters" is comprehensive (includes distance, age, genders)
- Consistent experience across both lanes

### No Automatic Lane Switching
- Users can manually switch lanes via segmented control
- Empty state shouldn't force lane changes
- Gives users control over their experience

### Unified Experience
- Both Pals and Match use same empty state pattern
- Only difference is lane-specific title text
- Easier to maintain and test

## Future Enhancements

### Deep Linking
Could link directly to specific preference sections:
- "Adjust distance" → `/preferences#distance`
- "Adjust age" → `/preferences#age`
- "Adjust genders" → `/preferences#genders`

### Smart Suggestions
Could analyze why feed is exhausted:
- "Try widening your distance to 50mi"
- "Expand age range from 25-35 to 21-40"
- "Try selecting 'Any' for gender"

### Alternative Actions
- "Reset recent passes" → Undo recent rejects
- "See who liked you" → Premium feature
- "Invite friends" → Referral program
