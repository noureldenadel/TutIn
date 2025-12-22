---
description: Implementation plan for YouTube-style sidebar with instructors, history, statistics, and learning roadmap
---

# Sidebar & Learning Roadmap Feature Implementation

## Overview
Add a YouTube-style collapsible sidebar with navigation to:
- Instructors (like Subscriptions)
- User Profile
- History (Recently Watched)
- Statistics Dashboard
- Learning Roadmap (visual node-based course connections)

## Phase 1: Core Sidebar Component

### 1.1 Create Sidebar Component
**File:** `src/components/layout/Sidebar.jsx`

Features:
- Collapsible (expanded/collapsed states)
- Persists state in localStorage
- Hamburger menu toggle in Header
- Smooth slide animation
- Overlay on mobile

Navigation items:
- Home (existing)
- Instructors
- History
- Statistics
- Roadmap
- Profile (bottom)

### 1.2 Update App Layout
**File:** `src/App.jsx`

- Wrap main content in a flex layout
- Sidebar on left, content on right
- Handle sidebar state globally (Context or prop drilling)
- Adjust main content margin when sidebar expands/collapses

### 1.3 Create Sidebar Context
**File:** `src/contexts/SidebarContext.jsx`

- `isExpanded` state
- `toggleSidebar()` function
- `collapseSidebar()` function
- Persist state

---

## Phase 2: Instructors Page

### 2.1 Create Instructors Page
**File:** `src/pages/InstructorsPage.jsx`

Features:
- List all unique instructors from courses
- Show instructor avatar (from course.instructorAvatar)
- Show course count per instructor
- Click to filter courses by instructor
- Search instructors

### 2.2 Update Database
**File:** `src/utils/db.js`

Add functions:
- `getAllInstructors()` - Get unique instructors from courses
- `getCoursesByInstructor(instructorName)` - Filter courses

---

## Phase 3: History Page

### 3.1 Create History Page
**File:** `src/pages/HistoryPage.jsx`

Features:
- Full recently watched list (not just 5)
- Group by date (Today, Yesterday, This Week, etc.)
- Video thumbnail previews
- Click to resume watching
- Clear history option
- Search history

### 3.2 Move "Recently Watched" from HomePage
- Remove from HomePage
- Add "History" link to sidebar

---

## Phase 4: Statistics Dashboard

### 4.1 Create Statistics Page
**File:** `src/pages/StatisticsPage.jsx`

Features:
- Total watch time
- Videos completed
- Courses completed
- Daily/weekly/monthly activity chart
- Learning streak
- Most watched instructors
- Category breakdown
- Progress over time graph

### 4.2 Update Analytics in Database
**File:** `src/utils/db.js`

Add/update functions:
- `recordDailyActivity(date, minutes)` - Track daily learning
- `getAnalytics(range)` - Get statistics for range
- `getLearningStreak()` - Calculate consecutive days

---

## Phase 5: Learning Roadmap (Whiteboard)

### 5.1 Create Roadmap Database Schema
**File:** `src/utils/db.js`

New store: `roadmaps`
```js
{
  id: string,
  title: string,
  description: string,
  nodes: [
    {
      id: string,
      courseId: string,  // Reference to course
      x: number,         // Canvas position
      y: number,
      width: number,
      height: number,
      status: 'not-started' | 'in-progress' | 'completed'
    }
  ],
  connections: [
    {
      id: string,
      fromNodeId: string,
      toNodeId: string,
      label: string  // Optional "then take" label
    }
  ],
  createdAt: string,
  updatedAt: string
}
```

### 5.2 Create Roadmap Page
**File:** `src/pages/RoadmapPage.jsx`

Features:
- Canvas-based or div-based whiteboard
- Drag courses from sidebar to canvas
- Create nodes for courses
- Connect nodes with arrows
- Pan & zoom canvas
- Auto-layout option
- Save/load roadmaps
- Multiple roadmaps support

### 5.3 Create Roadmap Components

**File:** `src/components/roadmap/RoadmapCanvas.jsx`
- Main canvas container
- Pan/zoom handling
- Grid background (optional)

**File:** `src/components/roadmap/RoadmapNode.jsx`
- Course card node
- Drag to move
- Connection points (top, bottom, left, right)
- Status indicator
- Quick actions (view course, edit, delete)

**File:** `src/components/roadmap/RoadmapConnection.jsx`
- SVG line/bezier curve between nodes
- Arrow head
- Optional label

**File:** `src/components/roadmap/CoursePalette.jsx`
- Sidebar with all courses
- Drag courses to canvas
- Search/filter courses

### 5.4 Roadmap Interactions
- Click + drag to pan canvas
- Scroll to zoom
- Drag node to move
- Click node connection point, drag to another node to connect
- Double-click connection to add label
- Delete key to remove selected node/connection
- Right-click context menu

---

## Phase 6: User Profile

### 6.1 Create Profile Page
**File:** `src/pages/ProfilePage.jsx`

Features:
- User avatar (uploaded or generated)
- Display name
- Learning goals
- Preferences (linked to Settings)
- Quick stats summary

### 6.2 Profile Context/Storage
- Store profile in localStorage or IndexedDB
- Avatar as base64 or blob

---

## Implementation Order

### Sprint 1: Sidebar Foundation
1. Create SidebarContext
2. Create Sidebar component
3. Update Header with hamburger toggle
4. Update App.jsx layout
5. Add routes for new pages (placeholder)

### Sprint 2: History & Instructors
1. Create HistoryPage
2. Create InstructorsPage
3. Remove "Recently Watched" from HomePage
4. Add instructor filtering

### Sprint 3: Statistics
1. Create StatisticsPage
2. Add analytics tracking
3. Create charts/visualizations

### Sprint 4: Roadmap (Complex)
1. Database schema for roadmaps
2. Basic canvas with nodes
3. Drag & drop courses
4. Connections between nodes
5. Save/load functionality
6. Polish & UX improvements

### Sprint 5: Profile & Polish
1. Create ProfilePage
2. Polish all features
3. Responsive design improvements

---

## Technical Notes

### Libraries to Consider (Optional)
- **React Flow** or **reactflow** - For roadmap diagram (recommended)
- **Chart.js** or **Recharts** - For statistics graphs
- **react-draggable** - For node dragging (if not using React Flow)

### Responsive Behavior
- Mobile: Sidebar as overlay, swipe to open
- Tablet: Collapsed by default
- Desktop: Expanded by default

### Dark Mode
All new components must support dark mode using existing Tailwind classes.
