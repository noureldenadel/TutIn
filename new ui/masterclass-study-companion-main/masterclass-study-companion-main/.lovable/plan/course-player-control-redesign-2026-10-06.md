# Course Player Control Redesign

## What I’ll change
- Add a small circular instructor avatar before the instructor name below the lesson title.
- Move previous and next lesson actions into the video controls beside play/pause.
- Replace the always-visible volume slider with an icon control that expands on hover or keyboard focus.
- Make the time display clickable so it toggles between elapsed/total time and remaining time.
- Group audio and subtitle choices on the right side of the player controls.
- Put playback speed and autoplay inside a settings menu, followed by fullscreen and hide/show sidebar controls.
- Remove the duplicate previous and next buttons below the player while keeping the Manage action.

## Interaction details
- Previous and next actions disable at the first and last lesson.
- Volume remains keyboard accessible when expanded.
- The sidebar control remains available after hiding the sidebar.
- Controls retain the existing neutral TutIn design and compact radius system.

## Verification
- Check the lesson player at desktop and mobile widths.
- Test play/pause, lesson navigation, volume, time mode, menus, fullscreen availability, and sidebar visibility.
