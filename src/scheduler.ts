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
  lastDayOfMonth,
  startOfDay,
  parseISO
} from 'date-fns';
import { 
  Task, 
  Holiday, 
  RecurrenceRule, 
  getFirstBusinessDayOfMonth, 
  getLastBusinessDayOfMonth, 
  isBusinessDay, 
  isHoliday, 
  calculateEndDate, 
  calculateStartDate,
  addBusinessDays,
  subBusinessDays
} from './types';

/**
 * Calculates scheduled dates for a task within a window.
 * For this app, we'll mostly care about the "next" or "current" instance for the Gantt view.
 */
export const calculateTaskInstances = (
  task: Task, 
  viewStart: Date, 
  viewEnd: Date, 
  holidays: Holiday[],
  allTasks: Task[] = []
): { start: Date; end: Date }[] => {
  const instances: { start: Date; end: Date }[] = [];
  const { recurrence, leadTime, baseType } = task;

  // If it's a subtask with relative scheduling info, depend on parent's instances
  if (task.parentId && task.offsetDays !== undefined && recurrence.type === 'none') {
    const parent = allTasks.find(t => t.id === task.parentId);
    if (parent) {
      const parentInstances = calculateTaskInstances(parent, viewStart, viewEnd, holidays, allTasks);
      parentInstances.forEach(pInst => {
        const referenceDate = task.parentPoint === 'start' ? pInst.start : pInst.end;
        const offset = task.offsetDirection === 'before' ? -task.offsetDays! : task.offsetDays!;
        
        const targetDate = offset >= 0 
          ? addBusinessDays(referenceDate, offset, holidays)
          : subBusinessDays(referenceDate, Math.abs(offset), holidays);
        
        let start: Date;
        let end: Date;

        if (task.baseType === 'deadline') {
          end = targetDate;
          start = calculateStartDate(end, leadTime, holidays);
        } else {
          start = targetDate;
          end = calculateEndDate(start, leadTime, holidays);
        }
        
        if (start <= viewEnd && end >= viewStart) {
          instances.push({ start, end });
        }
      });
      return instances;
    }
  }

  if (recurrence.type === 'none') {
    let anchor = task.baseDate ? parseISO(task.baseDate) : startOfDay(new Date(task.createdAt));
    if (isNaN(anchor.getTime())) return [];

    // Shift to previous business day if it lands on a non-business day
    if (!isBusinessDay(anchor, holidays)) {
      while (!isBusinessDay(anchor, holidays)) {
        anchor = addDays(anchor, -1);
      }
    }

    let start: Date;
    let end: Date;

    if (baseType === 'deadline') {
      end = anchor;
      start = calculateStartDate(end, leadTime, holidays);
    } else {
      start = anchor;
      end = calculateEndDate(start, leadTime, holidays);
    }
    
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
    
    // Look back: does this business day OR any PRECEDING non-business days match?
    // This shifts matches that land on a weekend FORWARD to the Monday (the 'day').
    while (true) {
      if (getRawMatches(checkDay)) {
        matched = true;
        break;
      }
      checkDay = addDays(checkDay, -1);
      // Stop looking if we hit the PREVIOUS business day (which would have caught its own preceding holidays)
      if (isBusinessDay(checkDay, holidays)) break;
    }

    if (matched) {
      let start: Date;
      let end: Date;

      if (baseType === 'start-date') {
        start = day;
        end = calculateEndDate(start, leadTime, holidays);
      } else {
        end = day;
        start = calculateStartDate(end, leadTime, holidays);
      }
      
      instances.push({ start, end });
    }
  });

  return instances;
};
