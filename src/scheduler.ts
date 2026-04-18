import { 
  addDays, 
  eachDayOfInterval, 
  format, 
  isSameDay, 
  startOfWeek, 
  endOfWeek, 
  addWeeks,
  startOfMonth,
  endOfMonth,
  isWeekend,
  lastDayOfMonth
} from 'date-fns';
import { Task, Holiday, RecurrenceRule, getFirstBusinessDayOfMonth, getLastBusinessDayOfMonth, isBusinessDay, isHoliday, calculateEndDate } from './types';

/**
 * Calculates scheduled dates for a task within a window.
 * For this app, we'll mostly care about the "next" or "current" instance for the Gantt view.
 */
export const calculateTaskInstances = (
  task: Task, 
  viewStart: Date, 
  viewEnd: Date, 
  holidays: Holiday[]
): { start: Date; end: Date }[] => {
  const instances: { start: Date; end: Date }[] = [];
  const { recurrence, leadTime } = task;

  if (recurrence.type === 'none') {
    const start = task.baseDate ? new Date(task.baseDate) : new Date(task.createdAt);
    if (isNaN(start.getTime())) return [];

    const end = calculateEndDate(start, leadTime, holidays);
    
    // Check overlap
    if (start <= viewEnd && end >= viewStart) {
      instances.push({ start, end });
    }
    return instances;
  }

  // Iterate through the visible window to find matches
  // A business day 'D' matches if it is a raw match or if it's the previous business day 
  // for a weekend/holiday that is a raw match.
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd });

  const getRawMatches = (date: Date): boolean => {
    if (recurrence.type === 'weekly' && recurrence.weeklyDays) {
      return recurrence.weeklyDays.includes(date.getDay());
    }

    if (recurrence.type === 'monthly' && recurrence.monthlyDays) {
      for (const rule of recurrence.monthlyDays) {
        if (typeof rule === 'number') {
          const ldom = lastDayOfMonth(date).getDate();
          if (date.getDate() === rule || (rule > ldom && date.getDate() === ldom)) return true;
        } else if (rule === 'first-business-day') {
          if (isSameDay(date, getFirstBusinessDayOfMonth(date, holidays))) return true;
        } else if (rule === 'last-business-day') {
          if (isSameDay(date, getLastBusinessDayOfMonth(date, holidays))) return true;
        } else if (typeof rule === 'string' && rule.startsWith('nth-business-day:')) {
          const n = parseInt(rule.split(':')[1]);
          const mStart = startOfMonth(date);
          const mEnd = endOfMonth(date);
          const allWeekdays = eachDayOfInterval({ start: mStart, end: mEnd }).filter(d => !isWeekend(d));
          if (n > 0 && n <= allWeekdays.length && isSameDay(date, allWeekdays[n - 1])) return true;
        } else if (typeof rule === 'string' && rule.startsWith('relative-last-business-day:')) {
          const offset = parseInt(rule.split(':')[1]) || 0;
          const lastBiz = getLastBusinessDayOfMonth(date, holidays);
          let target = lastBiz;
          if (offset < 0) {
            let count = 0;
            while (count < Math.abs(offset)) {
              target = addDays(target, -1);
              if (isBusinessDay(target, holidays)) count++;
            }
          }
          if (isSameDay(date, target)) return true;
        } else if (typeof rule === 'string' && rule.startsWith('nth-dow:')) {
          const parts = rule.split(':');
          if (parts.length === 3) {
            const n = parseInt(parts[1]);
            const dow = parseInt(parts[2]);
            const mStart = startOfMonth(date);
            let offset = dow - mStart.getDay();
            if (offset < 0) offset += 7;
            const targetDate = offset + 1 + (n - 1) * 7;
            if (targetDate <= endOfMonth(date).getDate()) {
              const targetDay = new Date(date.getFullYear(), date.getMonth(), targetDate);
              if (isSameDay(date, targetDay)) return true;
            }
          }
        }
      }
    }
    return false;
  };

  days.forEach(day => {
    // Only business days can "catch" shifted recurrences
    if (!isBusinessDay(day, holidays)) return;

    let matched = false;
    let checkDay = day;
    
    // Look ahead: does this business day OR any following non-business days match?
    while (true) {
      if (getRawMatches(checkDay)) {
        matched = true;
        break;
      }
      checkDay = addDays(checkDay, 1);
      // Stop looking if we hit a business day (which would catch its own subsequent holidays)
      if (isBusinessDay(checkDay, holidays)) break;
    }

    if (matched) {
      instances.push({ start: day, end: calculateEndDate(day, leadTime, holidays) });
    }
  });

  return instances;
};
