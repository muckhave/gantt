/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  format, 
  addDays, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isWeekend,
  addMonths,
  subMonths,
  differenceInDays,
  startOfDay
} from 'date-fns';
import { 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Calendar, 
  Clock, 
  List, 
  Settings, 
  Trash2, 
  CheckCircle2, 
  Circle,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon } from 'lucide-react';
import { 
  Task, 
  Holiday, 
  RecurrenceType, 
  RecurrenceRule,
  isHoliday, 
  isBusinessDay, 
  TaskTemplateSet, 
  TemplateItem, 
  subBusinessDays 
} from './types';
import { cn, generateId, COLORS } from './lib/utils';
import { calculateTaskInstances } from './scheduler';
import { translations } from './translations';

const t = translations.ja;

// --- Components ---

const TaskRow: React.FC<{ 
  task: Task; 
  level: number; 
  isExpanded: boolean; 
  onToggle: () => void;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (task: Task) => void;
}> = ({ 
  task, 
  level, 
  isExpanded, 
  onToggle, 
  onDelete, 
  onComplete,
  onEdit 
}) => {
  return (
    <div 
      className={cn(
        "group flex items-center h-[44px] border-b border-border hover:bg-white/5 transition-colors cursor-pointer",
        task.parentId ? "" : "bg-white/2"
      )}
      onClick={() => onEdit(task)}
    >
      <div style={{ width: `${level * 20}px` }} />
      <div className="flex items-center gap-2 px-4 flex-1 min-w-0">
        <button 
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={cn("p-1 hover:bg-white/10 rounded transition-opacity", level === 0 ? "opacity-100" : "opacity-0 invisible")}
        >
          {isExpanded ? <ChevronDown size={14} className="text-text-secondary" /> : <ChevronRight size={14} className="text-text-secondary" />}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
          className="hover:scale-110 transition-transform"
        >
          {task.isCompleted ? (
            <CheckCircle2 size={16} className="text-accent" />
          ) : (
            <Circle size={16} className="text-text-secondary opacity-40" />
          )}
        </button>
        <span className={cn(
          "truncate text-[13px] font-medium transition-opacity", 
          task.isCompleted ? "line-through opacity-30" : "text-text-primary"
        )}>
          {task.title}
        </span>
      </div>
      <div className="px-4 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className={cn(
          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tight",
          task.recurrence.type !== 'none' ? "border border-accent/50 text-accent" : "bg-border text-text-secondary"
        )}>
          {task.recurrence.type !== 'none' ? t.recurring : `${task.leadTime}d`}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          className="p-1 text-text-secondary hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

const RecurrenceOptions = ({ 
  type, 
  weeklyDays, 
  setWeeklyDays, 
  monthlyDays, 
  setMonthlyDays 
}: { 
  type: RecurrenceType; 
  weeklyDays: number[]; 
  setWeeklyDays: (days: number[]) => void;
  monthlyDays: (number | 'first-business-day' | 'last-business-day' | string)[];
  setMonthlyDays: (days: (number | 'first-business-day' | 'last-business-day' | string)[]) => void;
}) => {
  if (type === 'none') return null;

  if (type === 'weekly') {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return (
      <div className="space-y-2">
        <label className="block text-[10px] font-mono uppercase opacity-50">{t.repeatOn}</label>
        <div className="flex gap-1">
          {days.map((day, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const next = weeklyDays.includes(i) ? weeklyDays.filter(d => d !== i) : [...weeklyDays, i];
                setWeeklyDays(next);
              }}
              className={cn(
                "w-8 h-8 flex items-center justify-center text-[10px] font-bold border border-border transition-colors",
                weeklyDays.includes(i) ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
              )}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-[10px] font-mono uppercase opacity-50">{t.monthlySchedule}</label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const val = 'first-business-day' as const;
            const next = (monthlyDays as (number | 'first-business-day' | 'last-business-day')[]).includes(val) 
              ? monthlyDays.filter(d => d !== val) 
              : [...monthlyDays, val];
            setMonthlyDays(next as (number | 'first-business-day' | 'last-business-day')[]);
          }}
          className={cn(
            "px-2 py-1 text-[9px] font-bold border border-border uppercase tracking-tighter transition-colors",
            monthlyDays.includes('first-business-day') ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
          )}
        >
          {t.firstBizDay}
        </button>
        <button
          type="button"
          onClick={() => {
            const val = 'last-business-day' as const;
            const next = monthlyDays.includes(val) 
              ? monthlyDays.filter(d => d !== val) 
              : [...monthlyDays, val];
            setMonthlyDays(next);
          }}
          className={cn(
            "px-2 py-1 text-[9px] font-bold border border-border uppercase tracking-tighter transition-colors",
            monthlyDays.includes('last-business-day') ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
          )}
        >
          {t.lastBizDay}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map(n => {
          const val = `nth-business-day:${n}`;
          return (
            <button
              key={val}
              type="button"
              onClick={() => {
                const next = monthlyDays.includes(val) ? monthlyDays.filter(d => d !== val) : [...monthlyDays, val];
                setMonthlyDays(next);
              }}
              className={cn(
                "px-2 py-1 text-[9px] font-bold border border-border uppercase tracking-tighter transition-colors",
                monthlyDays.includes(val) ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
              )}
            >
              {t.nthBizDay.replace('{}', n.toString())}
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-8 gap-1">
          <div /> {/* Empty for row label */}
          {['日', '月', '火', '水', '木', '金', '土'].map(d => (
            <div key={d} className="text-[7px] text-center opacity-40 uppercase font-mono">{d}</div>
          ))}
        </div>
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className="grid grid-cols-8 gap-1 items-center">
            <div className="text-[7px] opacity-40 uppercase font-mono pr-1 text-right">第{n}</div>
            {[0, 1, 2, 3, 4, 5, 6].map(d => {
              const val = `nth-dow:${n}:${d}`;
              const active = monthlyDays.includes(val);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const next = active ? monthlyDays.filter(item => item !== val) : [...monthlyDays, val];
                    setMonthlyDays(next);
                  }}
                  className={cn(
                    "h-4 border border-border transition-colors",
                    active ? "bg-accent border-accent" : "hover:bg-white/5"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 31 }).map((_, i) => {
          const day = i + 1;
          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                const next = monthlyDays.includes(day) ? monthlyDays.filter(d => d !== day) : [...monthlyDays, day];
                setMonthlyDays(next);
              }}
              className={cn(
                "w-8 h-8 flex items-center justify-center text-[10px] border border-border transition-colors",
                monthlyDays.includes(day) ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const TemplateManager: React.FC<{
  templates: TaskTemplateSet[];
  onSave: (templates: TaskTemplateSet[]) => void;
  onClose: () => void;
}> = ({ templates, onSave, onClose }) => {
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplateSet | null>(null);

  const handleAddTemplate = () => {
    setEditingTemplate({ id: generateId(), name: 'New Template', items: [] });
  };

  const handleSaveEditing = () => {
    if (!editingTemplate) return;
    const next = templates.some(t => t.id === editingTemplate.id)
      ? templates.map(t => t.id === editingTemplate.id ? editingTemplate : t)
      : [...templates, editingTemplate];
    onSave(next);
    setEditingTemplate(null);
  };

  const handleDelete = (id: string) => {
    onSave(templates.filter(t => t.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl p-8 flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">{t.templateManage}</h2>
          {!editingTemplate && (
            <button 
              onClick={handleAddTemplate}
              className="px-4 py-2 bg-accent text-text-on-accent text-[11px] font-bold uppercase rounded hover:brightness-110"
            >
              {t.newTemplate}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-2">
          {editingTemplate ? (
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold uppercase text-text-secondary mb-2">{t.templateName}</label>
                <input 
                  value={editingTemplate.name}
                  onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})}
                  className="w-full bg-bg border border-border rounded px-4 py-3 text-text-primary"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.templateItems}</label>
                  <button 
                    onClick={() => {
                      const newItem: TemplateItem = { id: generateId(), title: 'Subtask', parentId: null, daysBeforeDeadline: 0, leadTime: 1 };
                      setEditingTemplate({...editingTemplate, items: [...editingTemplate.items, newItem]});
                    }}
                    className="text-[10px] text-accent font-bold hover:underline"
                  >
                    + {t.addTemplateItem}
                  </button>
                </div>
                
                <div className="space-y-4">
                  {editingTemplate.items.map((item, idx) => (
                    <div key={item.id} className="relative p-6 bg-bg border border-border rounded-xl space-y-4 group">
                      <div className="flex items-center gap-4">
                        <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.title}</label>
                        <input 
                          value={item.title}
                          onChange={e => {
                            const items = [...editingTemplate.items];
                            items[idx] = {...item, title: e.target.value};
                            setEditingTemplate({...editingTemplate, items});
                          }}
                          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-xs text-text-primary focus:border-accent outline-none transition-colors"
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.parentContext}</label>
                        <select
                          value={item.parentId || ''}
                          onChange={e => {
                            const items = [...editingTemplate.items];
                            items[idx] = {...item, parentId: e.target.value || null};
                            setEditingTemplate({...editingTemplate, items});
                          }}
                          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-xs text-text-primary cursor-pointer outline-none transition-colors focus:border-accent"
                        >
                          <option value="">(Root)</option>
                          {editingTemplate.items.filter(i => i.id !== item.id).map(i => (
                            <option key={i.id} value={i.id}>{i.title}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.daysBefore}</label>
                        <input 
                          type="number"
                          value={item.daysBeforeDeadline}
                          onChange={e => {
                            const items = [...editingTemplate.items];
                            items[idx] = {...item, daysBeforeDeadline: parseInt(e.target.value) || 0};
                            setEditingTemplate({...editingTemplate, items});
                          }}
                          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors"
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.leadTimeDays}</label>
                        <input 
                          type="number"
                          value={item.leadTime}
                          onChange={e => {
                            const items = [...editingTemplate.items];
                            items[idx] = {...item, leadTime: parseInt(e.target.value) || 0};
                            setEditingTemplate({...editingTemplate, items});
                          }}
                          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors"
                        />
                      </div>

                      <button 
                        onClick={() => {
                          setEditingTemplate({...editingTemplate, items: editingTemplate.items.filter(i => i.id !== item.id)});
                        }}
                        className="absolute -top-2 -right-2 bg-bg border border-border text-text-secondary hover:text-red-400 p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all z-10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-border">
                <button 
                  onClick={handleSaveEditing}
                  className="flex-1 bg-accent text-text-on-accent py-3 rounded text-[11px] font-bold uppercase"
                >
                  {t.saveTemplate}
                </button>
                <button 
                  onClick={() => setEditingTemplate(null)}
                  className="px-6 py-3 border border-border rounded text-[11px] font-bold uppercase text-text-secondary"
                >
                  {t.discard}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(tmp => (
                <div key={tmp.id} className="group flex items-center justify-between p-4 bg-bg border border-border rounded-lg hover:border-accent/40 transition-colors">
                  <div>
                    <h3 className="font-bold text-sm text-text-primary">{tmp.name}</h3>
                    <p className="text-[10px] text-text-secondary opacity-60 font-mono uppercase">{tmp.items.length} Tasks</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setEditingTemplate(tmp)}
                      className="p-2 text-text-secondary hover:text-accent transition-colors"
                    >
                      <Settings size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(tmp.id)}
                      className="p-2 text-text-secondary hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div className="py-12 text-center text-text-secondary opacity-40 italic text-xs">
                  {t.noTemplates}
                </div>
              )}
            </div>
          )}
        </div>

        {!editingTemplate && (
          <div className="mt-8 pt-6 border-t border-border flex justify-end">
            <button 
              onClick={onClose}
              className="px-8 py-3 bg-border text-text-primary text-[11px] font-bold uppercase rounded hover:bg-white/10"
            >
              {t.returnToDashboard}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [templates, setTemplates] = useState<TaskTemplateSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateDeadline, setTemplateDeadline] = useState<string>('');
  const [templateRecType, setTemplateRecType] = useState<RecurrenceType>('none');
  const [templateWeeklyDays, setTemplateWeeklyDays] = useState<number[]>([]);
  const [templateMonthlyDays, setTemplateMonthlyDays] = useState<(number | string)[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ganttflow_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ganttflow_theme', theme);
  }, [theme]);

  // Form State
  const [recType, setRecType] = useState<RecurrenceType>('none');
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [monthlyDays, setMonthlyDays] = useState<(number | 'first-business-day' | 'last-business-day')[]>([]);

  useEffect(() => {
    if (editingTask) {
      setRecType(editingTask.recurrence.type);
      setWeeklyDays(editingTask.recurrence.weeklyDays || []);
      setMonthlyDays(editingTask.recurrence.monthlyDays || []);
    } else {
      setRecType('none');
      setWeeklyDays([]);
      setMonthlyDays([]);
    }
  }, [editingTask, isFormOpen]);

  // Persistence
  useEffect(() => {
    const loadData = async () => {
      try {
        const [tasksRes, holidaysRes, templatesRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/holidays'),
          fetch('/api/templates')
        ]);
        const [tasksData, holidaysData, templatesData] = await Promise.all([
          tasksRes.json(),
          holidaysRes.json(),
          templatesRes.json()
        ]);
        setTasks(tasksData);
        setHolidays(holidaysData);
        setTemplates(templatesData);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const saveTasks = async (newTasks: Task[]) => {
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTasks)
      });
    } catch (err) {
      console.error('Failed to save tasks:', err);
    }
  };

  const saveHolidays = async (newHolidays: Holiday[]) => {
    try {
      await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHolidays)
      });
    } catch (err) {
      console.error('Failed to save holidays:', err);
    }
  };

  const saveTemplates = async (newTemplates: TaskTemplateSet[]) => {
    try {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTemplates)
      });
    } catch (err) {
      console.error('Failed to save templates:', err);
    }
  };

  useEffect(() => {
    if (!loading) saveTasks(tasks);
  }, [tasks, loading]);

  useEffect(() => {
    if (!loading) saveHolidays(holidays);
  }, [holidays, loading]);

  useEffect(() => {
    if (!loading) saveTemplates(templates);
  }, [templates, loading]);

  // Hierarchy Logic
  const hierarchicalTasks = useMemo(() => {
    const rootTasks = tasks.filter(t => !t.parentId);
    const result: { task: Task; level: number }[] = [];

    const traverse = (parentId: string | null, level: number) => {
      const children = tasks.filter(t => t.parentId === parentId);
      children.forEach(t => {
        result.push({ task: t, level });
        if (expandedIds.has(t.id)) {
          traverse(t.id, level + 1);
        }
      });
    };

    traverse(null, 0);
    return result;
  }, [tasks, expandedIds]);

  // Gantt Chart Calculations
  const timelineDates = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const handleCreateTask = (data: Partial<Task>) => {
    const newTask: Task = {
      id: generateId(),
      title: data.title || 'Untitled Task',
      parentId: data.parentId || null,
      leadTime: data.leadTime || 0,
      recurrence: data.recurrence || { type: 'none' },
      isCompleted: false,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      createdAt: Date.now(),
      baseDate: data.baseDate,
      ...data
    };
    setTasks(prev => [...prev, newTask]);
    return newTask.id;
  };

  const handleApplyTemplate = (templateId: string, deadlineStr: string, recurrence?: RecurrenceRule) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    // Determine the base deadline. 
    // If not provided manually, we use the first occurrence of the recurrence rule starting from today.
    let deadline: Date;
    if (deadlineStr) {
      deadline = new Date(deadlineStr);
    } else if (recurrence && recurrence.type !== 'none') {
      const today = startOfDay(new Date());
      const oneYearLater = addDays(today, 365);
      // Create a dummy task to find the first instance using scheduler logic
      const dummyTask: Task = {
        id: 'dummy',
        title: 'dummy',
        parentId: null,
        leadTime: 0,
        recurrence: recurrence,
        isCompleted: false,
        createdAt: Date.now()
      };
      const instances = calculateTaskInstances(dummyTask, today, oneYearLater, holidays);
      if (instances.length > 0) {
        deadline = instances[0].start;
      } else {
        deadline = today; // Fallback
      }
    } else {
      return; // Need either a manual deadline or an active recurrence rule
    }

    const parentTaskId = handleCreateTask({
      title: template.name,
      recurrence: recurrence || { type: 'none' },
      baseDate: format(deadline, 'yyyy-MM-dd'),
      leadTime: 0
    });

    const itemMap = new Map<string, string>(); // Original ID -> New ID
    const pendingItems = [...template.items];

    // Simple iterative approach to handle dependencies
    let progress = true;
    while (pendingItems.length > 0 && progress) {
      progress = false;
      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        
        // If it has no parent or parent is already created
        if (!item.parentId || itemMap.has(item.parentId)) {
          const calculatedStart = subBusinessDays(deadline, item.daysBeforeDeadline, holidays);
          
          let itemRecurrence: RecurrenceRule = { type: 'none' };
          if (recurrence && recurrence.type === 'weekly') {
            // Shift weekly days based on the offset of this specific item's start date
            const diffDays = Math.round((calculatedStart.getTime() - deadline.getTime()) / (1000 * 3600 * 24));
            const shiftedWeeklyDays = (recurrence.weeklyDays || []).map(day => {
              let newDay = (day + diffDays) % 7;
              if (newDay < 0) newDay += 7;
              return newDay;
            });
            itemRecurrence = { type: 'weekly', weeklyDays: shiftedWeeklyDays };
          } else if (recurrence && recurrence.type === 'monthly') {
            // Check if it's 'last-business-day' based. If so, use relative-last-business-day
            const isLastBizBased = recurrence.monthlyDays?.some(d => d === 'last-business-day');
            if (isLastBizBased) {
              itemRecurrence = { 
                type: 'monthly', 
                monthlyDays: [`relative-last-business-day:-${item.daysBeforeDeadline}`] 
              };
            } else {
              // Fallback to absolute day of month if it's a number
              const dayOfMonth = calculatedStart.getDate();
              itemRecurrence = { type: 'monthly', monthlyDays: [dayOfMonth] };
            }
          }

          const newId = handleCreateTask({
            title: item.title,
            parentId: item.parentId ? itemMap.get(item.parentId) : parentTaskId,
            leadTime: item.leadTime,
            recurrence: itemRecurrence,
            baseDate: format(calculatedStart, 'yyyy-MM-dd')
          });
          itemMap.set(item.id, newId || '');
          pendingItems.splice(i, 1);
          i--;
          progress = true;
        }
      }
    }

    // Add any remaining items that had broken parent links as children of the main parent
    pendingItems.forEach(item => {
      const calculatedStart = subBusinessDays(deadline, item.daysBeforeDeadline, holidays);
      handleCreateTask({
        title: item.title,
        parentId: parentTaskId,
        leadTime: item.leadTime,
        recurrence: { type: 'none' },
        baseDate: format(calculatedStart, 'yyyy-MM-dd')
      });
    });

    setIsFormOpen(false);
    setSelectedTemplateId('');
    setTemplateDeadline('');
    setTemplateRecType('none');
    setTemplateWeeklyDays([]);
    setTemplateMonthlyDays([]);
  };

  const handleUpdateTask = (id: string, data: Partial<Task>) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, ...data } : t));
    setEditingTask(null);
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id && t.parentId !== id));
  };

  const toggleComplete = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted } : t));
  };

  const listRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!listRef.current || !ganttRef.current) return;
    if (e.currentTarget === listRef.current) {
      ganttRef.current.scrollTop = listRef.current.scrollTop;
    } else {
      listRef.current.scrollTop = ganttRef.current.scrollTop;
    }
  };

  const dayWidth = 40;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg text-accent font-black uppercase tracking-[0.2em] animate-pulse">
        {t.brand} // Initializing Workspace...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg text-text-primary font-sans selection:bg-accent selection:text-black">
      {/* Real Sidebar as requested in design HTML */}
      <aside className="w-60 bg-sidebar border-r border-border flex flex-col pt-5">
        <div className="px-5 pb-8 font-bold text-lg tracking-widest text-accent flex items-center justify-between">
          <span>{t.brand}</span>
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-secondary hover:text-accent"
            title={t.themeSwitch}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
        <div className="nav-item active flex items-center gap-3 px-5 py-3 text-sm text-accent bg-accent-soft border-l-3 border-accent cursor-pointer">
          <Calendar size={16} /> <span>{t.projectBoard}</span>
        </div>
        <div className="nav-item flex items-center gap-3 px-5 py-3 text-sm text-text-secondary hover:text-text-primary cursor-pointer">
          <List size={16} /> <span>{t.schedule}</span>
        </div>
        
        <div className="mt-6 px-5 py-2 text-[10px] uppercase tracking-[1.5px] text-text-secondary opacity-50 font-bold">
          {t.taskSets}
        </div>
        <button 
          onClick={() => setIsTemplateManagerOpen(true)}
          className="flex items-center gap-3 w-full px-5 py-3 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <Settings size={14} /> <span>{t.templateManage}</span>
        </button>

        <div className="mt-auto border-t border-border p-4">
          <button 
            onClick={() => setIsHolidayManagerOpen(true)}
            className="flex items-center gap-3 w-full p-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <Settings size={14} /> <span>{t.calendarSettings}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex h-[60px] items-center justify-between px-8 border-b border-border bg-bg">
          <div>
            <h1 className="text-lg font-bold">2026 {t.projectFlow}</h1>
            <p className="text-[11px] text-text-secondary">AI Studio Build Applet {t.workspace}</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="bg-accent-soft text-accent text-[11px] px-3 py-1 rounded-full font-medium">
              {t.inProgress}: {tasks.length}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-surface p-1 rounded-md border border-border">
                <button className="px-3 py-1 text-[11px] rounded transition-colors text-text-secondary hover:text-text-primary">{t.listView}</button>
                <button className="px-3 py-1 text-[11px] rounded bg-border text-text-primary">{t.ganttView}</button>
              </div>
              <button 
                onClick={() => { setEditingTask(null); setIsFormOpen(true); }}
                className="bg-accent text-text-on-accent px-4 py-2 hover:brightness-110 transition-all text-[11px] font-bold uppercase tracking-wider rounded"
              >
                + {t.newTask}
              </button>
            </div>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* Month Stepper - integrated into the top of the timeline area instead of header for better UX */}
          
          {/* Task List Pane */}
          <section className="w-80 border-r border-border flex flex-col bg-sidebar/30">
            <div className="flex flex-col bg-sidebar border-b border-border h-20">
              <div className="h-10 border-b border-border/50 flex items-center px-4">
                <span className="text-[11px] font-bold text-text-secondary uppercase">{t.taskNameSet}</span>
                <span className="ml-auto text-[11px] font-bold text-text-secondary uppercase pr-2">{t.leadTime}</span>
              </div>
              <div className="h-10 flex items-center px-4 bg-surface/30">
                <button 
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-1 hover:text-accent"
                >
                  <ChevronRight size={14} className="rotate-180" />
                </button>
                <span className="flex-1 text-center text-[10px] font-bold uppercase tracking-widest text-text-secondary">
                  {format(currentMonth, 'yyyy年 MM月')}
                </span>
                <button 
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-1 hover:text-accent"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div 
              ref={listRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto scrollbar-hide"
            >
              {hierarchicalTasks.map(({ task, level }: { task: Task; level: number }) => (
                <TaskRow 
                  key={task.id} 
                  task={task} 
                  level={level} 
                  isExpanded={expandedIds.has(task.id)}
                  onToggle={() => toggleExpand(task.id)}
                  onDelete={deleteTask}
                  onComplete={toggleComplete}
                  onEdit={(t: Task) => { setEditingTask(t); setIsFormOpen(true); }}
                />
              ))}
              {tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 opacity-20 text-center">
                  <Calendar size={40} />
                  <p className="mt-4 text-[10px] uppercase font-bold tracking-widest">{t.workspaceEmpty}</p>
                </div>
              )}
            </div>
          </section>

          {/* Gantt Timeline Pane */}
          <section className="flex-1 overflow-x-auto relative bg-bg/50">
            <div 
              className="inline-block min-w-full h-full flex flex-col"
              style={{ width: `${timelineDates.length * dayWidth}px` }}
            >
              {/* Timeline Header */}
              <div className="flex-shrink-0 flex flex-col h-20 bg-sidebar border-b border-border sticky top-0 z-20">
                <div className="h-10 border-b border-border/50 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">
                  {t.schedule}
                </div>
                <div className="flex h-10">
                  {timelineDates.map(date => {
                    const isToday = isSameDay(date, new Date());
                    const isWe = isWeekend(date);
                    const isHoli = isHoliday(date, holidays);
                    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                    return (
                      <div 
                        key={date.toISOString()}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center justify-center border-r border-border/50 transition-colors",
                          isHoli && "bg-holiday/30",
                          isWe && "bg-weekend/50"
                        )}
                        style={{ width: `${dayWidth}px` }}
                      >
                        <span className={cn(
                          "text-[9px] font-bold uppercase",
                          isHoli ? "text-red-400" : "text-text-secondary"
                        )}>
                          {dayNames[date.getDay()]}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold",
                          isToday ? "text-accent border-b border-accent" : "text-text-secondary"
                        )}>
                          {format(date, 'd')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid Body with horizontal scroll sync isn't needed here if the parent is the scroll container, 
                  but we need vertical sync. So we use a nested scroll body. */}
              <div 
                ref={ganttRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto scrollbar-hide relative"
              >
                {/* Background vertical grid lines */}
                <div className="absolute inset-0 flex pointer-events-none min-h-full">
                  {timelineDates.map(date => (
                    <div 
                      key={date.toISOString()}
                      className={cn(
                        "flex-shrink-0 border-r border-border/30",
                        isHoliday(date, holidays) && "bg-holiday/10",
                        isWeekend(date) && "bg-weekend/20"
                      )}
                      style={{ width: `${dayWidth}px` }}
                    />
                  ))}
                </div>

                {/* Task Bars */}
                <div className="relative z-0">
                  {hierarchicalTasks.map(({ task }) => {
                    const startOfMonthView = startOfMonth(currentMonth);
                    const endOfMonthView = endOfMonth(currentMonth);

                    // Find all descendants recursively to calculate parent range
                    const getDescendantInstances = (parentId: string): { start: Date; end: Date }[] => {
                      const children = tasks.filter(t => t.parentId === parentId);
                      let allInstances: { start: Date; end: Date }[] = [];
                      
                      children.forEach(child => {
                        const childInstances = calculateTaskInstances(child, startOfMonthView, endOfMonthView, holidays);
                        allInstances = [...allInstances, ...childInstances];
                        allInstances = [...allInstances, ...getDescendantInstances(child.id)];
                      });
                      
                      return allInstances;
                    };

                    const ownInstances = calculateTaskInstances(task, startOfMonthView, endOfMonthView, holidays);
                    const descendantInstances = getDescendantInstances(task.id);
                    
                    // If it has children, the visually effective instances should cover its children
                    const visualInstances = ownInstances.map(own => {
                      // Filter descendant instances that roughly align with this recurrence cycle
                      // For simplicity in this UI, if it's recurring, we align by proximity
                      // But for non-recurring or simple cases, we just want the min/max
                      const relevantDescendants = descendantInstances.filter(d => 
                        // Overlapping or within a reasonable window of the parent instance
                        (d.start >= own.start && d.start <= own.end) ||
                        (d.end >= own.start && d.end <= own.end) ||
                        (d.start <= own.start && d.end >= own.end)
                      );

                      if (relevantDescendants.length === 0) return own;

                      const minStart = new Date(Math.min(own.start.getTime(), ...relevantDescendants.map(d => d.start.getTime())));
                      const maxEnd = new Date(Math.max(own.end.getTime(), ...relevantDescendants.map(d => d.end.getTime())));
                      
                      return { start: minStart, end: maxEnd };
                    });

                    // If it's a parent but has NO instances of its own in this view (e.g. leads to children), 
                    // we might still want to show a bracket if children are visible. 
                    // Let's refine: combine all instances
                    const displayedInstances = visualInstances.length > 0 ? visualInstances : (
                      // If it's a parent, show the bounding box of children
                      descendantInstances.length > 0 ? [{
                        start: new Date(Math.min(...descendantInstances.map(d => d.start.getTime()))),
                        end: new Date(Math.max(...descendantInstances.map(d => d.end.getTime())))
                      }] : []
                    ).filter(inst => inst.start <= endOfMonthView && inst.end >= startOfMonthView);

                    return (
                      <div key={task.id} className="h-[44px] flex items-center relative group">
                        {displayedInstances.map((instance, idx) => {
                          const startOffset = Math.max(0, differenceInDays(startOfDay(instance.start), startOfMonthView));
                          const duration = differenceInDays(startOfDay(instance.end), startOfDay(instance.start)) + 1;
                          
                          const hasChildren = tasks.some(t => t.parentId === task.id);

                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={cn(
                                "absolute h-6 rounded-md shadow-lg cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all flex items-center px-3 z-10",
                                task.isCompleted ? "opacity-30 grayscale" : "",
                                hasChildren ? "h-5 mt-0.5" : "" // Slightly thinner for parents
                              )}
                              style={{ 
                                left: `${startOffset * dayWidth}px`, 
                                width: `${duration * dayWidth - 4}px`,
                                backgroundColor: task.color || '#4da6ff',
                                top: '10px',
                                boxShadow: `0 4px 12px ${task.color}33`,
                                borderLeft: hasChildren ? `4px solid ${task.color}` : 'none',
                                borderRight: hasChildren ? `4px solid ${task.color}` : 'none',
                                borderRadius: hasChildren ? '2px' : '6px'
                              }}
                              title={`${task.title} (${format(instance.start, 'MMM d')} - ${format(instance.end, 'MMM d')})`}
                            >
                              {!hasChildren && (
                                <span className="text-[11px] truncate text-black font-bold tracking-tight">
                                  {task.title}
                                </span>
                              )}
                              {hasChildren && (
                                <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-black/20" />
                              )}
                            </motion.div>
                          );
                        })}
                        {/* Hover highlight row */}
                        <div className="absolute inset-x-0 h-full bg-white/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
        
        {/* Footer */}
        <footer className="h-10 bg-sidebar border-t border-border flex items-center px-6 gap-6 text-[10px] text-text-secondary uppercase tracking-[0.05em] font-medium transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-holiday" /> {t.holidaysRegistered}: {holidays.length}
          </div>
          <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-accent" /> {t.activeTasks}: {tasks.filter(t => !t.isCompleted).length}
          </div>
          <div className="ml-auto opacity-50">
             v1.3.0 {t.brand} Japanese Theme
          </div>
        </footer>
      </main>

      {/* Task Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl p-10"
            >
              <h2 className="text-xl font-bold mb-8 text-text-primary">
                {editingTask ? t.taskConfig : t.newTaskDef}
              </h2>
              
              {!editingTask && (
                <div className="mb-8 border-b border-border pb-8 last:border-0 last:pb-0">
                  <h3 className="text-[10px] font-bold uppercase text-accent tracking-[2px] mb-6 flex items-center gap-2">
                     <Settings size={12} /> {t.applyTemplate}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-6">
                      <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.selectTemplate}</label>
                      <select 
                        value={selectedTemplateId}
                        onChange={e => setSelectedTemplateId(e.target.value)}
                        className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 text-xs text-text-primary focus:outline-none focus:border-accent appearance-none cursor-pointer"
                      >
                        <option value="">{t.selectTemplate}</option>
                        {templates.map(tmp => (
                          <option key={tmp.id} value={tmp.id}>{tmp.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-6">
                      <label className={cn(
                        "w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest transition-opacity",
                        templateRecType !== 'none' && "opacity-30"
                      )}>
                        {t.deadline}
                      </label>
                      <input 
                        type="date"
                        value={templateDeadline}
                        disabled={templateRecType !== 'none'}
                        onChange={e => setTemplateDeadline(e.target.value)}
                        className={cn(
                          "flex-1 bg-bg border border-border rounded-lg px-4 py-3 text-xs text-text-primary focus:outline-none transition-all",
                          templateRecType !== 'none' ? "opacity-30 cursor-not-allowed bg-surface/50" : "focus:border-accent"
                        )}
                      />
                    </div>
                  </div>
                  {selectedTemplateId && (
                    <div className="mt-6 p-6 bg-bg/50 border border-border rounded-xl space-y-6">
                      <div className="flex items-center gap-6">
                        <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.recurrenceModel}</label>
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-1 bg-surface p-1 rounded-lg border border-border">
                            {(['none', 'weekly', 'monthly'] as const).map(type => (
                              <label key={type} className="flex-1">
                                <input 
                                  type="radio" 
                                  name="templateRecType" 
                                  value={type} 
                                  checked={templateRecType === type}
                                  onChange={() => {
                                    setTemplateRecType(type);
                                    if (type !== 'none') setTemplateDeadline('');
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="text-center py-2 text-[10px] rounded-md cursor-pointer transition-all uppercase tracking-widest font-black peer-checked:bg-accent peer-checked:text-text-on-accent text-text-secondary hover:text-text-primary">
                                  {t[type] || type}
                                </div>
                              </label>
                            ))}
                          </div>
                          {templateRecType !== 'none' && (
                            <p className="text-[10px] text-accent opacity-80 leading-relaxed font-medium">
                              <Clock size={10} className="inline mr-1 -mt-0.5" />
                              {t.recurrenceDeadlineInfo}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pl-32">
                        <RecurrenceOptions 
                          type={templateRecType}
                          weeklyDays={templateWeeklyDays}
                          setWeeklyDays={setTemplateWeeklyDays}
                          monthlyDays={templateMonthlyDays}
                          setMonthlyDays={setTemplateMonthlyDays}
                        />
                      </div>

                      <button 
                        onClick={() => handleApplyTemplate(selectedTemplateId, templateDeadline, {
                          type: templateRecType,
                          weeklyDays: templateWeeklyDays,
                          monthlyDays: templateMonthlyDays as any
                        })}
                        disabled={
                          !templateDeadline && 
                          (templateRecType === 'none' || 
                           (templateRecType === 'weekly' && templateWeeklyDays.length === 0) ||
                           (templateRecType === 'monthly' && templateMonthlyDays.length === 0))
                        }
                        className={cn(
                          "w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          (templateDeadline || (templateRecType !== 'none' && (templateWeeklyDays.length > 0 || templateMonthlyDays.length > 0)))
                            ? "bg-accent text-text-on-accent shadow-lg shadow-accent/20 hover:brightness-110 active:scale-[0.98]" 
                            : "bg-border text-text-secondary cursor-not-allowed"
                        )}
                      >
                        {templateDeadline || (templateRecType !== 'none' && (templateWeeklyDays.length > 0 || templateMonthlyDays.length > 0))
                          ? t.applyTemplate 
                          : (templateRecType !== 'none' ? t.recurrenceRuleRequired : t.deadlineRequired)}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data: Partial<Task> = {
                    title: formData.get('title') as string,
                    leadTime: parseInt(formData.get('leadTime') as string) || 0,
                    parentId: (formData.get('parentId') as string) || null,
                    recurrence: {
                      type: recType,
                      weeklyDays: recType === 'weekly' ? weeklyDays : [],
                      monthlyDays: recType === 'monthly' ? monthlyDays : []
                    }
                  };
                  if (editingTask) handleUpdateTask(editingTask.id, data);
                  else {
                    handleCreateTask(data);
                    setIsFormOpen(false);
                  }
                }}
                className="space-y-4"
              >
                <div className="flex items-center gap-6">
                  <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.title}</label>
                  <input 
                    name="title" 
                    defaultValue={editingTask?.title}
                    required
                    className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent font-medium text-text-primary transition-colors"
                    placeholder={t.titlePlaceholder}
                  />
                </div>
                
                <div className="flex items-center gap-6">
                  <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.leadTimeDays}</label>
                  <input 
                    name="leadTime" 
                    type="number" 
                    min="0"
                    defaultValue={editingTask?.leadTime || 0}
                    className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent text-text-primary transition-colors"
                  />
                </div>

                <div className="flex items-center gap-6">
                  <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.parentContext}</label>
                  <select 
                    name="parentId" 
                    defaultValue={editingTask?.parentId || ''}
                    className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent text-text-primary transition-colors cursor-pointer appearance-none"
                  >
                    <option value="">{t.topLevel}</option>
                    {tasks.filter(t => t.id !== editingTask?.id).map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-border pt-6 space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-text-secondary tracking-widest mb-4 text-center">{t.recurrenceModel}</label>
                    <div className="flex gap-1 bg-bg p-1 rounded-lg border border-border">
                       {(['none', 'weekly', 'monthly'] as const).map(type => (
                         <label key={type} className="flex-1">
                           <input 
                            type="radio" 
                            name="recType" 
                            value={type} 
                            checked={recType === type}
                            onChange={() => setRecType(type)}
                            className="sr-only peer"
                           />
                           <div className="text-center py-2 text-[10px] rounded-md cursor-pointer transition-all uppercase tracking-widest font-black peer-checked:bg-accent peer-checked:text-text-on-accent text-text-secondary hover:text-text-primary">
                             {t[type as keyof typeof t] || type}
                           </div>
                         </label>
                       ))}
                    </div>
                  </div>
                  
                  <div className="min-h-32">
                    <RecurrenceOptions 
                      type={recType} 
                      weeklyDays={weeklyDays} 
                      setWeeklyDays={setWeeklyDays}
                      monthlyDays={monthlyDays}
                      setMonthlyDays={setMonthlyDays}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="submit"
                    className="flex-1 bg-accent text-text-on-accent py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    {t.commitTask}
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setIsFormOpen(false); setEditingTask(null); }}
                    className="px-8 py-4 text-xs font-black uppercase tracking-widest border border-border rounded-xl text-text-secondary hover:bg-border hover:text-text-primary transition-all"
                  >
                    {t.discard}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Holiday Manager Modal */}
      <AnimatePresence>
        {isHolidayManagerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl p-10"
            >
              <h2 className="text-xl font-bold mb-8 text-text-primary">{t.calendarConfig}</h2>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const newHoli: Holiday = {
                    id: generateId(),
                    date: formData.get('date') as string,
                    name: formData.get('name') as string
                  };
                  setHolidays([...holidays, newHoli]);
                  e.currentTarget.reset();
                }}
                className="flex flex-col gap-4 mb-8"
              >
                <div className="flex gap-4">
                  <input name="date" type="date" required className="bg-bg border border-border rounded-lg p-3 text-xs text-text-primary flex-1 focus:outline-none focus:border-accent" />
                  <input name="name" type="text" placeholder={t.holidayTitle} required className="bg-bg border border-border rounded-lg p-3 text-xs text-text-primary flex-2 focus:outline-none focus:border-accent" />
                </div>
                <button type="submit" className="bg-accent text-black p-3 rounded-lg text-xs font-black uppercase tracking-widest">{t.registerDate}</button>
              </form>

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-bg/50">
                {holidays.length === 0 && <p className="p-8 text-center text-xs text-text-secondary opacity-50 uppercase tracking-widest font-bold">{t.noHolidays}</p>}
                <div className="divide-y divide-border">
                  {holidays.sort((a,b) => a.date.localeCompare(b.date)).map(h => (
                    <div key={h.id} className="p-4 flex items-center justify-between group">
                      <div>
                        <div className="text-xs font-bold text-text-primary">{h.name}</div>
                        <div className="text-[10px] font-mono text-text-secondary">{h.date}</div>
                      </div>
                      <button 
                        onClick={() => setHolidays(holidays.filter(item => item.id !== h.id))}
                        className="text-text-secondary hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={() => setIsHolidayManagerOpen(false)}
                  className="w-full bg-border text-text-primary py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:brightness-125 transition-all text-center"
                >
                  {t.returnToDashboard}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isTemplateManagerOpen && (
        <TemplateManager 
          templates={templates}
          onSave={setTemplates}
          onClose={() => setIsTemplateManagerOpen(false)}
        />
      )}
    </div>
  );
}
