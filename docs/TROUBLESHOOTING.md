# Troubleshooting Log

This document tracks issues encountered during development and their resolutions.

---

## Keyboard Covering Message View (v1.2.2)

**Date**: 2026-01-08

**Issue**: When opening the keyboard in the chat/message view, the keyboard covers the bottom part of the screen, making it impossible to see messages near the bottom or the text being typed.

**Symptoms**:
- User taps on message input to type
- Keyboard opens and pushes input up
- Message list content stays in place
- Bottom messages are hidden behind keyboard + input

**Root Cause**:
The `FlashList` component was wrapped in a plain `View` container. While `KeyboardStickyView` correctly moved the input up with the keyboard, the `FlashList` content didn't adjust its bottom inset to account for the keyboard height.

The `messageListContentStyle` even reduced padding when keyboard was visible (`paddingBottom: isKeyboardVisible ? 0 : Spacing.sm`), which was counterproductive.

**Solution**:
Integrated `KeyboardAwareScrollView` from `react-native-keyboard-controller` with `FlashList` using the `renderScrollComponent` prop.

**Files Modified**:
- `app/sessions/[hostId]/[projectId]/[sessionId]/index.tsx`

**Changes**:
1. Added `forwardRef` import from React
2. Added `KeyboardAwareScrollView` import from `react-native-keyboard-controller`
3. Created `RenderScrollComponent` - a forwarded ref wrapper for `KeyboardAwareScrollView`
4. Added `renderScrollComponent={RenderScrollComponent}` prop to `FlashList`
5. Updated `messageListContentStyle` to have consistent bottom padding (80px for input area)

**Code Snippet**:
```tsx
// Scroll component for FlashList that integrates with KeyboardAwareScrollView
const RenderScrollComponent = forwardRef<any, any>((props, ref) => (
  <KeyboardAwareScrollView {...props} ref={ref} />
));

// In FlashList:
<FlashList
  renderScrollComponent={RenderScrollComponent}
  // ...
/>
```

**References**:
- [KeyboardAwareScrollView Docs](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-aware-scroll-view)
- [FlashList renderScrollComponent](https://shopify.github.io/flash-list/docs/usage/)

**Status**: Fixed
