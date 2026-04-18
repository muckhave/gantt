import { addDays, format, isWeekend, lastDayOfMonth, startOfMonth, isSameDay } from 'date-fns';

export type RecurrenceType = 'none' | 'weekly' | 'monthly';

export type HolidayAdjustment = 'next' | 'prev' | 'skip';

export interface RecurrenceRule {
  type: RecurrenceType;
  interval?: number; // e.g., every 3 months
  months?: number[]; // 1-12 (for monthly patterns that repeat only in certain months)
  weeklyDays?: number[]; // 0-6
  monthlyDays?: (number | 'first-business-day' | 'last-business-day' | string)[]; // e.g., 'nth-business-day:2'
  holidayAdjustment?: HolidayAdjustment;
}

export interface Task {
  id: string;
  title: string;
  parentId: string | null;
  leadTime: number; // in days
  recurrence: RecurrenceRule;
  isCompleted: boolean;
  color?: string;
  createdAt: number;
  baseDate?: string; // YYYY-MM-DD for non-recurring tasks
  baseType?: 'deadline' | 'start-date';
  offsetDays?: number;
  offsetDirection?: 'before' | 'after';
  parentPoint?: 'start' | 'deadline';
}

export interface TemplateItem {
  id: string;
  title: string;
  parentId: string | null;
  offsetDays: number;
  offsetDirection: 'before' | 'after';
  parentPoint: 'start' | 'deadline';
  targetPoint: 'start' | 'deadline';
  leadTime: number; // calendar days
}

export interface TaskTemplateSet {
  id: string;
  name: string;
  items: TemplateItem[];
  baseType: 'deadline' | 'start-date';
}

export interface Holiday {
  id: string;
  date: string; // ISO string YYYY-MM-DD
  name: string;
}

export interface GanttTask extends Task {
  startDate: Date;
  endDate: Date;
  level: number;
  isExpanded: boolean;
}

// Utility functions
export const isHoliday = (date: Date, holidays: Holiday[]) => {
  const dateStr = format(date, 'yyyy-MM-dd');
  return holidays.some(h => h.date === dateStr);
};

export const isBusinessDay = (date: Date, holidays: Holiday[]) => {
  return !isWeekend(date) && !isHoliday(date, holidays);
};

export const getNextBusinessDay = (date: Date, holidays: Holiday[], direction: 1 | -1 = 1) => {
  let current = date;
  while (!isBusinessDay(current, holidays)) {
    current = addDays(current, direction);
  }
  return current;
};

export const getFirstBusinessDayOfMonth = (date: Date, holidays: Holiday[]) => {
  return getNextBusinessDay(startOfMonth(date), holidays, 1);
};

export const getLastBusinessDayOfMonth = (date: Date, holidays: Holiday[]) => {
  return getNextBusinessDay(lastDayOfMonth(date), holidays, -1);
};

export const subBusinessDays = (date: Date, offset: number, holidays: Holiday[]) => {
  let current = date;
  let count = 0;
  while (count < offset) {
    current = addDays(current, -1);
    if (isBusinessDay(current, holidays)) {
      count++;
    }
  }
  return current;
};

export const addBusinessDays = (date: Date, offset: number, holidays: Holiday[]) => {
  let current = date;
  let count = 0;
  while (count < offset) {
    current = addDays(current, 1);
    if (isBusinessDay(current, holidays)) {
      count++;
    }
  }
  return current;
};

export const calculateEndDate = (startDate: Date, leadTime: number, holidays: Holiday[]): Date => {
  if (leadTime <= 0) return startDate;
  let current = startDate;
  let bDays = isBusinessDay(startDate, holidays) ? 1 : 0;
  while (bDays < leadTime) {
    current = addDays(current, 1);
    if (isBusinessDay(current, holidays)) {
      bDays++;
    }
  }
  return current;
};

export const calculateStartDate = (endDate: Date, leadTime: number, holidays: Holiday[]): Date => {
  if (leadTime <= 0) return endDate;
  let current = endDate;
  let bDays = isBusinessDay(endDate, holidays) ? 1 : 0;
  while (bDays < leadTime) {
    current = addDays(current, -1);
    if (isBusinessDay(current, holidays)) {
       bDays++;
    }
  }
  return current;
};
