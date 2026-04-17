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
  isWeekend
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
  // For recurring tasks, we still want to calculate end date for each instance
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd });

  days.forEach(day => {
    let matches = false;
    // ... (rest of recurrence logic remains same, we'll keep the existing matching logic)

    if (recurrence.type === 'weekly' && recurrence.weeklyDays) {
      if (recurrence.weeklyDays.includes(day.getDay())) {
        let targetDay = day;
        if (!isBusinessDay(targetDay, holidays)) {
          while (!isBusinessDay(targetDay, holidays)) {
            targetDay = addDays(targetDay, -1);
          }
        }
        if (isSameDay(day, targetDay)) matches = true;
      }
    } else if (recurrence.type === 'monthly' && recurrence.monthlyDays) {
      recurrence.monthlyDays.forEach(rule => {
        if (typeof rule === 'number') {
          if (day.getDate() === rule) {
            let targetDay = day;
            if (!isBusinessDay(targetDay, holidays)) {
              while (!isBusinessDay(targetDay, holidays)) {
                targetDay = addDays(targetDay, -1);
              }
            }
            if (isSameDay(day, targetDay)) matches = true;
          }
        } else if (rule === 'first-business-day') {
          if (isSameDay(day, getFirstBusinessDayOfMonth(day, holidays))) matches = true;
        } else if (rule === 'last-business-day') {
          if (isSameDay(day, getLastBusinessDayOfMonth(day, holidays))) matches = true;
        } else if (typeof rule === 'string' && rule.startsWith('nth-business-day:')) {
          const n = parseInt(rule.split(':')[1]);
          // Find the N-th weekday (M-F) of the month
          const monthStart = startOfMonth(day);
          const monthEnd = endOfMonth(day);
          const allWeekdays = eachDayOfInterval({ start: monthStart, end: monthEnd })
            .filter(d => !isWeekend(d));
          
          if (n > 0 && n <= allWeekdays.length) {
            let targetDay = allWeekdays[n - 1];
            // Rule: If it's not a business day, move back to previous business day
            if (!isBusinessDay(targetDay, holidays)) {
              while (!isBusinessDay(targetDay, holidays)) {
                targetDay = addDays(targetDay, -1);
              }
            }
            if (isSameDay(day, targetDay)) matches = true;
          }
        } else if (typeof rule === 'string' && rule.startsWith('relative-last-business-day:')) {
          const offset = parseInt(rule.split(':')[1]) || 0;
          const lastBiz = getLastBusinessDayOfMonth(day, holidays);
          
          let targetDay = lastBiz;
          if (offset < 0) {
            let count = 0;
            while (count < Math.abs(offset)) {
              targetDay = addDays(targetDay, -1);
              if (isBusinessDay(targetDay, holidays)) {
                count++;
              }
            }
          }
          if (isSameDay(day, targetDay)) matches = true;
        } else if (typeof rule === 'string' && rule.startsWith('nth-dow:')) {
          const parts = rule.split(':');
          if (parts.length === 3) {
            const n = parseInt(parts[1]); // 1-5
            const dow = parseInt(parts[2]); // 0-6 (Sun-Sat)
            
            const monthStart = startOfMonth(day);
            const firstDayOfMonth = monthStart.getDay();
            
            // Calculate date of the N-th instance of the specific DOW
            let offset = dow - firstDayOfMonth;
            if (offset < 0) offset += 7;
            const firstOccurrenceDate = offset + 1;
            const targetDate = firstOccurrenceDate + (n - 1) * 7;
            
            if (targetDate <= endOfMonth(day).getDate()) {
              let targetDay = new Date(day.getFullYear(), day.getMonth(), targetDate);
              
              // Rule: If it's not a business day, move back to previous business day
              if (!isBusinessDay(targetDay, holidays)) {
                while (!isBusinessDay(targetDay, holidays)) {
                  targetDay = addDays(targetDay, -1);
                }
              }
              if (isSameDay(day, targetDay)) matches = true;
            }
          }
        }
      });
    }

    if (matches) {
      instances.push({ start: day, end: calculateEndDate(day, leadTime, holidays) });
    }
  });

  return instances;
};
