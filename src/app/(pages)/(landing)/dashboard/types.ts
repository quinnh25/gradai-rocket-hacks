export interface GradPlanCourse {
  code: string;
  credits: number;
  requirement: string;
  notes?: string;
}

export interface GradPlanSemester {
  label: string;
  courses: GradPlanCourse[];
  totalCredits: number;
}

export interface GradPlanOutput {
  semesters: GradPlanSemester[];
  totalCreditsRemaining: number;
  expectedGraduation: string;
}