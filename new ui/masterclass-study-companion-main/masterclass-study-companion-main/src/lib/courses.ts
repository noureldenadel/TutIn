export interface Course {
  id: number;
  title: string;
  instructor: string;
  lessons: number;
  language: string;
  duration: string;
  progress: number;
  tags?: string[] | undefined;
  category?: string | undefined;
  art?: string | undefined;
  thumbnailUrl?: string | undefined;
  thumbnailSeed?: number | undefined;
  thumbnailHue?: number | undefined;
  sourceType?: "local" | "youtube" | "drive" | "link" | undefined;
  courseUrl?: string | undefined;
}

export const courses: Course[] = [
  // Maya Chen (3 courses) - Design & UI/UX
  { id: 1, title: "Product Design Fundamentals", instructor: "Maya Chen", lessons: 12, language: "English", duration: "4h 20m", progress: 65, art: "course-art-mint", category: "Design & UI/UX", tags: ["UI/UX", "Product Design", "Figma"] },
  { id: 5, title: "Design Systems & Component Architecture", instructor: "Maya Chen", lessons: 16, language: "English", duration: "6h 40m", progress: 20, art: "course-art-mint", category: "Design & UI/UX", tags: ["Design Systems", "UI/UX", "Components"] },
  { id: 6, title: "AI-Assisted Interaction Design", instructor: "Maya Chen", lessons: 14, language: "English", duration: "5h 15m", progress: 0, art: "course-art-mint", category: "Design & UI/UX", tags: ["AI", "Interaction", "UI/UX"] },

  // Oliver Grant (4 courses) - Filmmaking & Storytelling
  { id: 2, title: "Documentary Storytelling", instructor: "Oliver Grant", lessons: 18, language: "English", duration: "6h 10m", progress: 38, art: "course-art-gold", category: "Filmmaking", tags: ["Storytelling", "Directing", "Documentary"] },
  { id: 7, title: "Cinematic Camera & Lighting", instructor: "Oliver Grant", lessons: 14, language: "English", duration: "5h 30m", progress: 0, art: "course-art-gold", category: "Filmmaking", tags: ["Cinematography", "Lighting", "Camera"] },
  { id: 8, title: "Sound Design & Foley for Film", instructor: "Oliver Grant", lessons: 12, language: "English", duration: "4h 50m", progress: 80, art: "course-art-gold", category: "Filmmaking", tags: ["Sound Design", "Audio", "Foley"] },
  { id: 9, title: "Directing Non-Actors & Real Characters", instructor: "Oliver Grant", lessons: 12, language: "English", duration: "4h 10m", progress: 15, art: "course-art-gold", category: "Filmmaking", tags: ["Directing", "Interviews", "Production"] },

  // Sofía Marín (2 courses)
  { id: 3, title: "Practical Spanish: Everyday Conversations", instructor: "Sofía Marín", lessons: 24, language: "Spanish", duration: "8h 05m", progress: 100, art: "course-art-blue", category: "Languages", tags: ["Spanish", "Conversation", "Vocabulary"] },
  { id: 10, title: "Advanced Distributed Systems Architecture", instructor: "Sofía Marín", lessons: 16, language: "English", duration: "6h 15m", progress: 45, art: "course-art-blue", category: "Programming", tags: ["Distributed Systems", "Architecture", "Databases"] },

  // Nia Williams (3 courses)
  { id: 4, title: "The Art of Thoughtful Leadership", instructor: "Nia Williams", lessons: 10, language: "English", duration: "3h 45m", progress: 12, art: "course-art-coral", category: "Leadership", tags: ["Leadership", "Management", "Culture"] },
  { id: 11, title: "Production Kubernetes & Cloud Infrastructure", instructor: "Nia Williams", lessons: 16, language: "English", duration: "7h 20m", progress: 55, art: "course-art-coral", category: "Programming", tags: ["Kubernetes", "Cloud", "DevOps"] },
  { id: 12, title: "Zero-Trust Security for Modern Teams", instructor: "Nia Williams", lessons: 12, language: "English", duration: "5h 10m", progress: 0, art: "course-art-coral", category: "Programming", tags: ["Security", "Zero-Trust", "Infrastructure"] },

  // Daniel Okafor (2 courses)
  { id: 13, title: "Mathematics for Deep Learning", instructor: "Daniel Okafor", lessons: 15, language: "English", duration: "6h 30m", progress: 30, art: "course-art-mint", category: "AI & Machine Learning", tags: ["Deep Learning", "Mathematics", "Linear Algebra"] },
  { id: 14, title: "Reinforcement Learning from Human Feedback", instructor: "Daniel Okafor", lessons: 12, language: "English", duration: "5h 40m", progress: 0, art: "course-art-mint", category: "AI & Machine Learning", tags: ["RLHF", "LLMs", "Reinforcement Learning"] },

  // Lena Kovács (2 courses)
  { id: 15, title: "Edge Computing with Cloudflare Workers", instructor: "Lena Kovács", lessons: 12, language: "English", duration: "4h 45m", progress: 70, art: "course-art-blue", category: "Programming", tags: ["Edge Computing", "Serverless", "Cloudflare"] },
  { id: 16, title: "Next-Gen Web Networking & Protocols", instructor: "Lena Kovács", lessons: 10, language: "English", duration: "4h 15m", progress: 0, art: "course-art-blue", sourceType: "link", courseUrl: "https://web.dev/explore/fast", category: "Programming", tags: ["Networking", "HTTP/3", "Web Performance"] },

  // Dev Patel (1 course)
  { id: 17, title: "Fullstack Web Architecture with Modern React", instructor: "Dev Patel", lessons: 14, language: "English", duration: "6h 00m", progress: 10, art: "course-art-gold", category: "Programming", tags: ["React", "TypeScript", "Fullstack"] },

  // Lucas Zanotto (5 courses) - Motion Graphics
  { id: 18, title: "3D Character Animation Principles", instructor: "Lucas Zanotto", lessons: 14, language: "English", duration: "6h 20m", progress: 85, art: "course-art-coral", category: "Motion Graphics", tags: ["3D Animation", "Character Design", "Blender"] },
  { id: 19, title: "Creative Coding & WebGL Foundations", instructor: "Lucas Zanotto", lessons: 12, language: "English", duration: "5h 15m", progress: 40, art: "course-art-coral", category: "Motion Graphics", tags: ["WebGL", "Three.js", "Creative Coding"] },
  { id: 20, title: "Shape Language & Playful Motion Design", instructor: "Lucas Zanotto", lessons: 10, language: "English", duration: "4h 30m", progress: 100, art: "course-art-coral", category: "Motion Graphics", tags: ["Motion Design", "Shape Language", "Animation"] },
  { id: 21, title: "Kinetic Typography in Motion", instructor: "Lucas Zanotto", lessons: 12, language: "English", duration: "5h 45m", progress: 0, art: "course-art-coral", category: "Motion Graphics", tags: ["Typography", "Motion Graphics", "Keyframes"] },
  { id: 22, title: "Minimalist Sound & Audio-Visual Sync", instructor: "Lucas Zanotto", lessons: 12, language: "English", duration: "6h 10m", progress: 10, art: "course-art-coral", sourceType: "link", courseUrl: "https://threejs.org", category: "Motion Graphics", tags: ["Audio Sync", "Sound Design", "Motion"] },

  // Ana Ruiz (1 course)
  { id: 23, title: "Event-Driven Microservices with Kafka", instructor: "Ana Ruiz", lessons: 16, language: "English", duration: "7h 00m", progress: 25, art: "course-art-mint", category: "Programming", tags: ["Kafka", "Microservices", "Event-Driven"] },

  // Hana Kim (2 courses)
  { id: 24, title: "Diffusion Models & Generative AI Art", instructor: "Hana Kim", lessons: 13, language: "English", duration: "5h 50m", progress: 60, art: "course-art-gold", category: "AI & Machine Learning", tags: ["Diffusion Models", "Generative AI", "PyTorch"] },
  { id: 25, title: "Neural Rendering & Real-Time Computer Vision", instructor: "Hana Kim", lessons: 12, language: "English", duration: "5h 10m", progress: 0, art: "course-art-gold", category: "AI & Machine Learning", tags: ["Computer Vision", "NeRF", "Neural Rendering"] },
];

export function getSavedCourses(): Course[] {
  if (typeof window === "undefined") return courses;
  try {
    const deletedIds: number[] = JSON.parse(window.localStorage.getItem("tutin_deleted_courses") || "[]");
    const overrides: Record<number, Course> = JSON.parse(window.localStorage.getItem("tutin_courses_override") || "{}");
    const custom: Course[] = JSON.parse(window.localStorage.getItem("tutin_custom_courses") || "[]");

    const baseMerged = courses
      .filter((c) => !deletedIds.includes(c.id))
      .map((c) => overrides[c.id] || c);

    const customMerged = custom
      .filter((c) => !deletedIds.includes(c.id))
      .map((c) => overrides[c.id] || c);

    return [...customMerged, ...baseMerged];
  } catch {
    return courses;
  }
}

export function findSavedCourseById(courseId: string): Course | undefined {
  return getSavedCourses().find((c) => String(c.id) === String(courseId));
}

