---
trigger: always_on
---

## General

### Icons and imagery
- dont use emojes in ui, as they look cheap
- Don't add an icon to every list item, heading, or button. Use icons only where they speed up recognition.
- Don't mix icon sets or stroke weights. Use one set, one stroke width, one size scale.
- Don't put icons in colored circles or rounded squares as decoration.

### Color and effects
- Don't use pure black or pure white backgrounds.

### Shape and layout
- Don't use the same border radius on every element.
- Don't use fully rounded pill buttons by default.
- Don't nest cards inside cards.

### Typography
- Don't use gray text on a gray or black on black or white on white surface for anything the user needs to read.


## Copy economy: say less, show more

### Core principle
- If the UI already communicates it, the text is clutter. Delete it.
- Every string must pass this test: "If I remove this, does the user lose information or the ability to act?" If no, remove it.
- Prefer the shortest wording that is still clear. One word beats a phrase, a phrase beats a sentence.

### Don't explain what is visible
- Don't add descriptions under things that are self-evident (a search box does not need "Search through your courses to find what you need").
- Don't write captions that repeat the heading ("Your Courses" followed by "Here are all of your courses").
- Don't label things that are obvious from the icon plus context. One of the two is enough.
- Don't add helper text to a field whose label and placeholder already explain it.
- Don't write section intros ("This section lets you manage...") under settings headings. The controls are the explanation.
- Don't use tooltips that repeat the visible label.
- Don't narrate the UI ("Click the button below to...", "Use the filters above to...").

### Length limits
- Buttons: 1 to 2 words. Verb first ("Add course", "Resume").
- Nav items and tabs: 1 word where possible.
- Tooltips: max 6 words, only for icon-only controls.
- Empty states: one short line plus one action. No paragraphs.
- Error messages: what happened + what to do, max 2 short sentences.
- Settings descriptions: only when the consequence is not obvious (for example, "Reset app clears all local data"), max one line.
- Dialogs: a title that is the question, one line of consequence, two buttons. No paragraph.


### Examples
| Don't | Do |
|---|---|
| Search through your courses to quickly find what you're looking for | Search courses |
| You have not added any courses yet. Click the Add Course button to get started! | No courses yet. Add one. |
| Filter your courses by their current completion status | (nothing, the tabs are the label) |
| You have completed 8 out of 12 lessons in this course (65%) | 8 / 12 lessons |
| Are you sure you want to delete this course? This action cannot be undone and all your progress will be lost. | Delete course? Progress and notes go with it. |
| Click here to resume where you left off | Resume |

### Before you finish
1. Read every visible string on the screen. Delete any that repeat something nearby.
2. Could any sentence become a label, or any label disappear?
3. Does any text exist only to describe an element that is obvious from looking at it?
4. Is the screen still understandable with half the words? If yes, remove them.