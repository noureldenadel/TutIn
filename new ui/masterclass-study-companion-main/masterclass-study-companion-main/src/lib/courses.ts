export interface Course {
  id: number;
  title: string;
  instructor: string;
  lessons: number;
  language: string;
  duration: string;
  progress: number;
  art?: string;
  thumbnailUrl?: string;
  thumbnailSeed?: number;
  thumbnailHue?: number;
}

export const courses: Course[] = [
  { id: 1, title: "Product Design Fundamentals", instructor: "Maya Chen", lessons: 12, language: "English", duration: "4h 20m", progress: 65, art: "course-art-mint" },
  { id: 2, title: "Documentary Storytelling", instructor: "Oliver Grant", lessons: 18, language: "English", duration: "6h 10m", progress: 38, art: "course-art-gold" },
  { id: 3, title: "Practical Spanish: Everyday Conversations", instructor: "Sofía Marín", lessons: 24, language: "Spanish", duration: "8h 05m", progress: 100, art: "course-art-blue" },
  { id: 4, title: "The Art of Thoughtful Leadership", instructor: "Nia Williams", lessons: 10, language: "English", duration: "3h 45m", progress: 12, art: "course-art-coral" },
];
