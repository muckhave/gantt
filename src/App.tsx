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
  startOfDay,
  parseISO
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
  GripVertical,
  X,
  HelpCircle,
  Layers,
  Infinity as InfinityIcon,
  FileText,
  Eye,
  Edit3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon } from 'lucide-react';
import { 
  Task, 
  Holiday, 
  RecurrenceType, 
  RecurrenceRule,
  HolidayAdjustment,
  isHoliday, 
  isBusinessDay, 
  TaskTemplateSet, 
  TemplateItem, 
  Status,
  StatusSet,
  subBusinessDays,
  addBusinessDays,
  calculateEndDate,
  calculateStartDate
} from './types';
import { cn, generateId, COLORS } from './lib/utils';
import { calculateTaskInstances } from './scheduler';
import { translations } from './translations';

const t = translations.ja;

// --- Types ---

interface DragState {
  taskId: string;
  originalDate?: string;
  type: 'move' | 'resize';
  startX: number;
  initialBaseDate: string;
  initialLeadTime: number;
}

const ConfirmDialog: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  pendingChange: { id: string; baseDate: string; leadTime: number };
  tasks: Task[];
}> = ({ onConfirm, onCancel, title, pendingChange, tasks }) => {
  const task = tasks.find(t => t.id === pendingChange.id);
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-sm bg-black/40">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-surface border border-border rounded-3xl shadow-2xl p-8"
      >
        <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock className="text-accent" size={24} />
        </div>
        <h3 className="text-lg font-bold text-text-primary mb-6 text-center">{title}</h3>
        
        <div className="space-y-4 mb-8">
          <div className="p-4 bg-bg rounded-xl border border-border">
            <div className="text-[10px] font-bold uppercase text-text-secondary mb-2 tracking-widest">{t.currentPeriod}</div>
            <div className="text-sm font-medium text-text-primary">
              {task.baseDate ? format(parseISO(task.baseDate), 'yyyy年MM月dd日') : '---'}
              <span className="mx-2 text-text-secondary">→</span>
              {task.leadTime}日
            </div>
          </div>
          <div className="p-4 bg-accent-soft rounded-xl border border-accent/20">
            <div className="text-[10px] font-bold uppercase text-accent mb-2 tracking-widest">{t.newPeriod}</div>
            <div className="text-sm font-bold text-text-primary">
              {format(parseISO(pendingChange.baseDate), 'yyyy年MM月dd日')}
              <span className="mx-2 text-text-secondary">→</span>
              {pendingChange.leadTime}日
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={onConfirm}
            className="flex-1 bg-accent text-text-on-accent py-3 rounded-xl text-[11px] font-bold uppercase shadow-lg shadow-accent/20 transform active:scale-95 transition-all"
          >
            {t.applyChange}
          </button>
          <button 
            onClick={onCancel}
            className="flex-1 bg-bg border border-border text-text-secondary py-3 rounded-xl text-[11px] font-bold uppercase hover:bg-white/5 transition-all"
          >
            {t.cancelChange}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const EditModeDialog: React.FC<{
  onSelect: (mode: 'individual' | 'recurring') => void;
  onCancel: () => void;
}> = ({ onSelect, onCancel }) => (
  <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 backdrop-blur-sm bg-black/40">
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="w-full max-w-sm bg-surface border border-border rounded-3xl shadow-2xl p-8"
    >
      <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <Settings className="text-accent" size={24} />
      </div>
      <h3 className="text-lg font-bold text-text-primary mb-2 text-center">{t.selectEditMode}</h3>
      <p className="text-xs text-text-secondary text-center mb-8">{t.editModeDescription}</p>
      
      <div className="flex flex-col gap-3">
        <button 
          onClick={() => onSelect('individual')}
          className="w-full bg-accent text-text-on-accent py-4 rounded-xl text-[11px] font-bold uppercase shadow-lg shadow-accent/20 transform active:scale-95 transition-all text-center"
        >
          {t.editIndividual}
        </button>
        <button 
          onClick={() => onSelect('recurring')}
          className="w-full bg-bg border border-border text-text-primary py-4 rounded-xl text-[11px] font-bold uppercase hover:bg-white/5 transition-all active:scale-95 text-center"
        >
          {t.editRecurring}
        </button>
        <button 
          onClick={onCancel}
          className="w-full mt-4 text-[10px] uppercase font-bold text-text-secondary tracking-widest hover:text-text-primary transition-colors text-center"
        >
          {t.cancel}
        </button>
      </div>
    </motion.div>
  </div>
);

const DatePicker: React.FC<{
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value ? parseISO(value) : new Date());
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const days = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    // Pad to start on Sunday
    const startDay = start.getDay();
    const daysArr = [];
    for (let i = 0; i < startDay; i++) {
      daysArr.push(null);
    }
    const daysInMonth = eachDayOfInterval({ start, end });
    return [...daysArr, ...daysInMonth];
  }, [viewMonth]);

  const selectedDate = value ? parseISO(value) : null;

  return (
    <div className="relative flex-1" ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "flex-1 bg-bg border border-border rounded-lg px-4 py-3 text-xs text-text-primary flex items-center justify-between cursor-pointer transition-all",
          disabled ? "opacity-30 cursor-not-allowed bg-surface/50" : "hover:border-accent focus-within:border-accent",
          isOpen && "border-accent ring-1 ring-accent/20"
        )}
      >
        <span>{value ? format(parseISO(value), 'yyyy/MM/dd') : '日付を選択'}</span>
        <Calendar size={14} className="text-text-secondary" />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute left-0 top-full mt-2 w-72 bg-surface border border-border rounded-xl shadow-2xl z-[60] p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <button 
                type="button"
                onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                className="p-1 hover:bg-white/5 rounded text-text-secondary"
              >
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <div className="text-[11px] font-black uppercase tracking-widest text-text-primary">
                {format(viewMonth, 'yyyy年 MM月')}
              </div>
              <button 
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                className="p-1 hover:bg-white/5 rounded text-text-secondary"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['日', '月', '火', '水', '木', '金', '土'].map(d => (
                <div key={d} className="text-[9px] font-bold text-text-secondary text-center py-1 uppercase opacity-50">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const isWe = isWeekend(day);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      onChange(format(day, 'yyyy-MM-dd'));
                      setIsOpen(false);
                    }}
                    className={cn(
                      "aspect-square flex items-center justify-center text-[10px] rounded-lg transition-all",
                      isSelected 
                        ? "bg-accent text-text-on-accent font-bold scale-110 shadow-lg shadow-accent/40" 
                        : "text-text-primary hover:bg-white/10",
                      isToday && !isSelected && "border border-accent/40 text-accent",
                      isWe && !isSelected && "text-text-secondary opacity-60"
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
              <button 
                type="button"
                onClick={() => {
                  onChange(format(new Date(), 'yyyy-MM-dd'));
                  setIsOpen(false);
                }}
                className="text-[10px] font-bold text-accent hover:underline"
              >
                今日
              </button>
              {value && (
                <button 
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="text-[10px] font-bold text-text-secondary hover:text-red-400"
                >
                  クリア
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatusBadge: React.FC<{
  task: Task;
  statusSets: StatusSet[];
  onUpdate: (id: string, data: Partial<Task>) => void;
}> = ({ task, statusSets, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const statusSet = statusSets.find(s => s.id === task.statusSetId);
  if (!statusSet) return null;

  const currentStatus = statusSet.statuses.find(s => s.id === task.statusId);

  return (
    <div className="relative">
      <div
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase cursor-pointer transition-all hover:brightness-110 active:scale-95 border whitespace-nowrap"
        style={{ 
          backgroundColor: `${currentStatus?.color || '#94a3b8'}20`,
          borderColor: `${currentStatus?.color || '#94a3b8'}40`,
          color: currentStatus?.color || '#94a3b8'
        }}
      >
        {currentStatus?.name || '---'}
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 5 }}
              className="absolute left-0 mt-2 bg-surface border border-border rounded-lg shadow-2xl z-50 p-1 min-w-[120px]"
            >
              {statusSet.statuses.map(s => (
                <button
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate(task.id, { statusId: s.id });
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded text-[10px] text-text-primary text-left transition-colors"
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatusSetManager: React.FC<{
  statusSets: StatusSet[];
  onSave: (sets: StatusSet[]) => void;
  onClose: () => void;
}> = ({ statusSets, onSave, onClose }) => {
  const [editingSet, setEditingSet] = useState<StatusSet | null>(null);

  const handleAddSet = () => {
    setEditingSet({ 
      id: generateId(), 
      name: 'New Status Set', 
      statuses: [
        { id: generateId(), name: 'To Do', color: '#94a3b8' },
        { id: generateId(), name: 'Completed', color: '#10b981' }
      ] 
    });
  };

  const handleSaveEditing = () => {
    if (!editingSet) return;
    const next = statusSets.some(s => s.id === editingSet.id)
      ? statusSets.map(s => s.id === editingSet.id ? editingSet : s)
      : [...statusSets, editingSet];
    onSave(next);
    setEditingSet(null);
  };

  const handleDelete = (id: string) => {
    onSave(statusSets.filter(s => s.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl p-8 flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-8 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-text-primary">{t.statusManage}</h2>
            {editingSet && (
              <span className="text-[10px] font-bold px-2 py-1 bg-accent/10 text-accent rounded uppercase">
                Editing: {editingSet.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!editingSet && (
              <button 
                onClick={handleAddSet}
                className="px-4 py-2 bg-accent text-text-on-accent text-[11px] font-bold uppercase rounded hover:brightness-110 shadow-lg shadow-accent/20"
              >
                {t.newStatusSet}
              </button>
            )}
            <button onClick={onClose} className="p-2 text-text-secondary hover:text-text-primary transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
          {editingSet ? (
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold uppercase text-text-secondary mb-2 tracking-widest">{t.statusSetName}</label>
                <input 
                  value={editingSet.name}
                  onChange={e => setEditingSet({...editingSet, name: e.target.value})}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-text-primary outline-none focus:border-accent text-sm"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.status}</label>
                  <button 
                    onClick={() => {
                      const newStatus: Status = { id: generateId(), name: 'New Status', color: '#3b82f6' };
                      setEditingSet({...editingSet, statuses: [...editingSet.statuses, newStatus]});
                    }}
                    className="text-[10px] text-accent font-black py-2 px-4 bg-accent/5 border border-accent/20 rounded-full hover:bg-accent hover:text-text-on-accent transition-all"
                  >
                    + {t.addStatus}
                  </button>
                </div>

                <div className="space-y-3">
                  {editingSet.statuses.map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-4 p-4 bg-bg rounded-xl border border-border group/s">
                      <input 
                        type="color"
                        value={s.color}
                        onChange={e => {
                          const sts = [...editingSet.statuses];
                          sts[idx] = {...s, color: e.target.value};
                          setEditingSet({...editingSet, statuses: sts});
                        }}
                        className="w-10 h-10 rounded-lg overflow-hidden bg-transparent border-none cursor-pointer p-0"
                      />
                      <input 
                        value={s.name}
                        onChange={e => {
                          const sts = [...editingSet.statuses];
                          sts[idx] = {...s, name: e.target.value};
                          setEditingSet({...editingSet, statuses: sts});
                        }}
                        className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-xs text-text-primary outline-none focus:border-accent"
                        placeholder={t.statusName}
                      />
                      <button 
                        onClick={() => {
                          setEditingSet({...editingSet, statuses: editingSet.statuses.filter(st => st.id !== s.id)});
                        }}
                        className="text-text-secondary hover:text-red-400 p-2"
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
                  className="flex-1 bg-accent text-text-on-accent py-3 rounded-xl text-[11px] font-bold uppercase"
                >
                  {t.saveStatusSet}
                </button>
                <button 
                  onClick={() => setEditingSet(null)}
                  className="px-8 py-3 bg-bg border border-border rounded-xl text-[11px] font-bold uppercase text-text-secondary"
                >
                  {t.discard}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {statusSets.map(s => (
                <div 
                  key={s.id} 
                  className="p-6 bg-surface border border-border rounded-2xl cursor-pointer hover:border-accent/40 transition-all flex items-center justify-between"
                  onClick={() => setEditingSet(s)}
                >
                  <div>
                    <h3 className="font-bold text-lg text-text-primary mb-2">{s.name}</h3>
                    <div className="flex gap-2">
                       {s.statuses.map(st => (
                         <div key={st.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                       ))}
                       <span className="text-[10px] text-text-secondary uppercase font-bold ml-2">{s.statuses.length} Statuses</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                      className="p-3 bg-bg border border-border rounded-xl text-text-secondary hover:text-red-400"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// --- Components ---

const TaskRow: React.FC<{ 
  task: Task; 
  level: number; 
  isExpanded: boolean; 
  statusSets: StatusSet[];
  hasChildren: boolean;
  instanceDate?: string;
  onToggle: () => void;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (task: Task, originalDate?: string) => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onViewDescription: (task: Task) => void;
}> = ({ 
  task, 
  level, 
  isExpanded, 
  statusSets,
  hasChildren,
  instanceDate,
  onToggle, 
  onDelete, 
  onComplete,
  onEdit,
  onUpdate,
  onViewDescription
}) => {
  return (
    <div 
      className={cn(
        "group flex items-center h-[44px] border-b border-border hover:bg-white/5 transition-colors cursor-pointer",
        task.parentId ? "" : "bg-white/2"
      )}
      onClick={() => { if (hasChildren) onToggle(); }}
    >
      <div style={{ width: `${level * 20}px` }} />
      <div className="flex items-center gap-2 px-4 flex-1 min-w-0">
        <button 
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(); }}
          className={cn("p-1 hover:bg-white/10 rounded transition-opacity", hasChildren ? "opacity-100" : "opacity-0 invisible")}
        >
          {isExpanded ? <ChevronDown size={14} className="text-text-secondary" /> : <ChevronRight size={14} className="text-text-secondary" />}
        </button>
        
        {task.statusSetId ? (
          <StatusBadge task={task} statusSets={statusSets} onUpdate={onUpdate} />
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
            className="hover:scale-110 transition-transform flex-shrink-0"
          >
            {task.isCompleted ? (
              <CheckCircle2 size={16} className="text-accent" />
            ) : (
              <Circle size={16} className="text-text-secondary opacity-40" />
            )}
          </button>
        )}
        
        <span className={cn(
          "truncate text-[13px] font-medium transition-opacity", 
          task.isCompleted ? "line-through opacity-30" : "text-text-primary uppercase tracking-tight"
        )}>
          {task.title}
          {instanceDate && (task.recurrence.type !== 'none' || task.parentId) && (
            <span className="text-[10px] text-accent font-bold ml-2 opacity-80 decoration-none inline-block">
              [{format(parseISO(instanceDate), 'MM/dd')}]
            </span>
          )}
        </span>
        
        {task.description && (
          <div className="relative group/desc">
            <button
              onClick={(e) => { e.stopPropagation(); onViewDescription(task); }}
              className="p-1 text-accent opacity-60 hover:opacity-100 transition-opacity"
            >
              <FileText size={12} />
            </button>
            <div className="absolute left-0 top-full mt-2 w-64 p-4 bg-surface border border-border rounded-xl shadow-2xl opacity-0 invisible group-hover/desc:opacity-100 group-hover/desc:visible transition-all z-[100] pointer-events-none">
              <div className="markdown-body max-h-48 overflow-y-auto pr-2">
                <ReactMarkdown>{task.description}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="px-4 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className={cn(
          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tight",
          task.recurrence.type !== 'none' ? "border border-accent/50 text-accent" : (task.isIndefinite ? "bg-accent/20 text-accent border border-accent/30" : "bg-border text-text-secondary")
        )}>
          {task.recurrence.type !== 'none' ? t.recurring : (task.isIndefinite ? t.indefinite : `${task.leadTime}d`)}
        </div>
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            if (task.recurrence.type !== 'none') {
              onEdit(task, task.baseDate);
            } else {
              onEdit(task); 
            }
          }}
          className="p-1 text-text-secondary hover:text-accent"
        >
          <Settings size={14} />
        </button>
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
  setType,
  weeklyDays, 
  setWeeklyDays, 
  monthlyDays, 
  setMonthlyDays,
  interval,
  setInterval,
  months,
  setMonths,
  holidayAdjustment,
  setHolidayAdjustment
}: { 
  type: RecurrenceType; 
  setType: (type: RecurrenceType) => void;
  weeklyDays: number[]; 
  setWeeklyDays: (days: number[]) => void;
  monthlyDays: (number | 'first-business-day' | 'last-business-day' | string)[];
  setMonthlyDays: (days: (number | 'first-business-day' | 'last-business-day' | string)[]) => void;
  interval: number;
  setInterval: (val: number) => void;
  months: number[];
  setMonths: (val: number[]) => void;
  holidayAdjustment: HolidayAdjustment;
  setHolidayAdjustment: (val: HolidayAdjustment) => void;
}) => {
  if (type === 'none') return null;

  const IntervalPicker = () => (
    <div className="space-y-3 mb-6 bg-white/5 p-4 rounded-xl border border-white/5">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-black uppercase text-text-secondary tracking-widest">{t.repeatEvery}</label>
        <div className="flex bg-bg p-1 rounded-lg border border-border">
          {(['weekly', 'monthly'] as const).map(u => (
            <button
              key={u}
              type="button"
              onClick={() => setType(u)}
              className={cn(
                "px-3 py-1 text-[9px] font-black uppercase rounded-md transition-all",
                type === u ? "bg-accent text-text-on-accent shadow-sm" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {u === 'weekly' ? t.weekUnit : t.monthUnit}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <input 
            type="number"
            min="1"
            value={interval}
            onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:border-accent outline-none text-center font-bold"
          />
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">{type === 'weekly' ? t.weekUnit : t.monthUnit}</span>
        </div>

        {type === 'monthly' && (
          <div className="flex-1 flex flex-wrap gap-1 border-l border-border pl-4">
            {Array.from({ length: 12 }).map((_, i) => {
              const m = i + 1;
              const active = months.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const next = active ? months.filter(x => x !== m) : [...months, m].sort((a,b) => a-b);
                    setMonths(next);
                  }}
                  className={cn(
                    "w-7 h-7 flex items-center justify-center text-[8px] font-black border border-border transition-colors rounded",
                    active ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {type === 'monthly' && <p className="text-[8px] text-text-secondary italic opacity-60">{t.monthsOfYear}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <IntervalPicker />
      
      {type === 'weekly' ? (
        <div className="space-y-3">
          <label className="block text-[10px] font-black uppercase text-text-secondary tracking-widest">{t.repeatOn}</label>
          <div className="flex gap-2">
            {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const next = weeklyDays.includes(i) ? weeklyDays.filter(d => d !== i) : [...weeklyDays, i];
                  setWeeklyDays(next);
                }}
                className={cn(
                  "flex-1 h-10 flex items-center justify-center text-[10px] font-black border border-border transition-all rounded-xl",
                  weeklyDays.includes(i) ? "bg-accent text-text-on-accent border-accent shadow-lg shadow-accent/20" : "hover:bg-white/5 text-text-secondary"
                )}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="block text-[10px] font-black uppercase text-text-secondary tracking-widest">{t.monthlySchedule}</label>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const val = 'first-business-day' as const;
                  const next = (monthlyDays as any[]).includes(val) ? monthlyDays.filter(d => d !== val) : [...monthlyDays, val];
                  setMonthlyDays(next as any);
                }}
                className={cn(
                  "py-3 text-[9px] font-black border border-border rounded-xl uppercase tracking-widest transition-all",
                  monthlyDays.includes('first-business-day') ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
                )}
              >
                {t.firstBizDay}
              </button>
              <button
                type="button"
                onClick={() => {
                  const val = 'last-business-day' as const;
                  const next = monthlyDays.includes(val) ? monthlyDays.filter(d => d !== val) : [...monthlyDays, val];
                  setMonthlyDays(next);
                }}
                className={cn(
                  "py-3 text-[9px] font-black border border-border rounded-xl uppercase tracking-widest transition-all",
                  monthlyDays.includes('last-business-day') ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
                )}
              >
                {t.lastBizDay}
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
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
                      "py-2 text-[8px] font-bold border border-border rounded-lg uppercase tracking-tighter transition-all",
                      monthlyDays.includes(val) ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
                    )}
                  >
                    {t.nthBizDayShort.replace('{}', n.toString())}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                const val = `last-nth-business-day:${n}`;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const next = monthlyDays.includes(val) ? monthlyDays.filter(d => d !== val) : [...monthlyDays, val];
                      setMonthlyDays(next);
                    }}
                    className={cn(
                      "py-2 text-[8px] font-bold border border-border rounded-lg uppercase tracking-tighter transition-all",
                      monthlyDays.includes(val) ? "bg-accent text-text-on-accent border-accent" : "hover:bg-white/5 text-text-secondary"
                    )}
                  >
                    {t.nthLastBizDay.replace('{}', n.toString())}
                  </button>
                );
              })}
            </div>

            <div className="bg-bg/50 p-4 rounded-xl border border-border/50 space-y-2">
              <div className="grid grid-cols-8 gap-1 mb-1">
                <div />
                {['日', '月', '火', '水', '木', '金', '土'].map(d => (
                  <div key={d} className="text-[7px] text-center opacity-40 uppercase font-black">{d}</div>
                ))}
              </div>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} className="grid grid-cols-8 gap-1 items-center">
                  <div className="text-[7px] opacity-40 uppercase font-black pr-1 text-right">第{n}</div>
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
                          "h-5 rounded-sm border border-border transition-all",
                          active ? "bg-accent border-accent shadow-sm" : "hover:bg-white/5"
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 pt-2">
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
                      "h-8 flex items-center justify-center text-[9px] font-black border border-border rounded-lg transition-all",
                      monthlyDays.includes(day) ? "bg-accent text-text-on-accent border-accent shadow-sm" : "hover:bg-white/5 text-text-secondary"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="pt-6 border-t border-border/50">
        <label className="block text-[10px] font-black uppercase text-text-secondary tracking-widest mb-3">{t.holidayAdjustment}</label>
        <div className="flex gap-1 bg-bg p-1 rounded-xl border border-border">
          {(['next', 'prev', 'skip'] as const).map(adj => (
            <button
              key={adj}
              type="button"
              onClick={() => setHolidayAdjustment(adj)}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all",
                holidayAdjustment === adj 
                  ? "bg-accent text-text-on-accent shadow-lg shadow-accent/20" 
                  : "text-text-secondary hover:bg-white/5"
              )}
            >
              {adj === 'next' ? t.adjNext : adj === 'prev' ? t.adjPrev : t.adjSkip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const TemplatePreview: React.FC<{ items: TemplateItem[]; baseType: 'deadline' | 'start-date' }> = ({ items, baseType }) => {
  const resolveItems = (): (TemplateItem & { start: number; end: number; level: number })[] => {
    const resolved = new Map<string, { start: number; end: number; level: number }>();
    const pending = [...items];
    let progress = true;

    while (pending.length > 0 && progress) {
      progress = false;
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        if (!item.parentId || resolved.has(item.parentId)) {
          let ref: number;
          let level: number = 0;

          if (!item.parentId) {
            ref = 0; // Base Date is Day 0
          } else {
            const parent = resolved.get(item.parentId)!;
            ref = item.parentPoint === 'start' ? parent.start : parent.end;
            level = parent.level + 1;
          }

          const offset = item.offsetDirection === 'before' ? -item.offsetDays : item.offsetDays;
          const targetPoint = ref + offset;

          let start: number;
          let end: number;

          if (item.targetPoint === 'start') {
            start = targetPoint;
            end = start + item.leadTime;
          } else {
            end = targetPoint;
            start = end - item.leadTime;
          }

          resolved.set(item.id, { start, end, level });
          pending.splice(i, 1);
          i--;
          progress = true;
        }
      }
    }

    return items.map(item => ({
      ...item,
      ...(resolved.get(item.id) || { start: 0, end: 1, level: 0 })
    }));
  };

  const resolvedItems = resolveItems();
  
  if (resolvedItems.length === 0) return null;

  const minDay = Math.min(0, ...resolvedItems.map(i => i.start));
  const maxDay = Math.max(0, ...resolvedItems.map(i => i.end));
  const range = maxDay - minDay || 1;
  const padding = range * 0.1;

  const getX = (day: number) => {
    return `${((day - minDay + padding) / (range + padding * 2)) * 100}%`;
  };

  return (
    <div className="bg-bg/50 border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.templatePreview}</h3>
        <span className={cn(
          "px-2 py-0.5 rounded text-[8px] font-bold uppercase",
          baseType === 'deadline' ? "bg-red-400/10 text-red-400" : "bg-green-400/10 text-green-400"
        )}>
          {baseType === 'deadline' ? t.deadlineBase : t.startDateBase}
        </span>
      </div>

      <div className="relative h-48 overflow-y-auto custom-scrollbar pr-2">
        <div className="absolute top-0 bottom-0 w-px bg-accent z-10" style={{ left: getX(0) }}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-text-on-accent text-[8px] px-1 rounded whitespace-nowrap font-bold">
            {t.baseDatePoint}
          </div>
        </div>

        <div className="space-y-2 pt-4">
          {resolvedItems.map((item, idx) => (
            <div key={item.id} className="relative h-6 flex items-center group">
              <div 
                className="absolute h-4 rounded bg-accent/20 border border-accent/40 flex items-center px-2 min-w-[4px] transition-all"
                style={{ 
                  left: getX(item.start), 
                  width: `${((item.end - item.start) / (range + padding * 2)) * 100}%` 
                }}
              >
                <span className="text-[8px] font-bold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.title}
                </span>
                
                {/* Visual indicator for parent-child relationship */}
                {item.parentId && (
                  <div 
                    className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-accent"
                    title={`Linked to parent at Day ${item.start - item.leadTime}`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* X-Axis labels */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between border-t border-border/50 pt-1">
          <span className="text-[8px] text-text-secondary">{Math.floor(minDay)}d</span>
          <span className="text-[8px] text-text-secondary">{Math.floor(maxDay)}d</span>
        </div>
      </div>
    </div>
  );
};

const TemplateManager: React.FC<{
  templates: TaskTemplateSet[];
  statusSets: StatusSet[];
  onSave: (templates: TaskTemplateSet[]) => void;
  onClose: () => void;
}> = ({ templates, statusSets, onSave, onClose }) => {
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplateSet | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingTemplate) {
          setEditingTemplate(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingTemplate, onClose]);

  const handleAddTemplate = () => {
    setEditingTemplate({ 
      id: generateId(), 
      name: 'New Template', 
      items: [], 
      baseType: 'deadline',
      statusEnabled: false,
      statusSetId: null
    });
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
        className={cn(
          "w-full bg-surface border border-border rounded-xl shadow-2xl p-8 flex flex-col max-h-[90vh] transition-all",
          editingTemplate ? "max-w-6xl" : "max-w-2xl"
        )}
      >
        <div className="flex items-center justify-between mb-8 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-text-primary">{t.templateManage}</h2>
            {editingTemplate && (
              <span className="text-[10px] font-bold px-2 py-1 bg-accent/10 text-accent rounded uppercase">
                Editing: {editingTemplate.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!editingTemplate && (
              <button 
                onClick={handleAddTemplate}
                className="px-4 py-2 bg-accent text-text-on-accent text-[11px] font-bold uppercase rounded hover:brightness-110 shadow-lg shadow-accent/20"
              >
                {t.newTemplate}
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 custom-scrollbar">
          {editingTemplate ? (
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1 space-y-6 pb-8">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-text-secondary mb-2 tracking-widest">{t.templateName}</label>
                  <input 
                    value={editingTemplate.name}
                    onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-4 text-text-primary outline-none focus:border-accent transition-all text-sm font-medium"
                    placeholder="Enter template name..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-text-secondary mb-2 tracking-widest">{t.templateBaseType}</label>
                  <div className="flex gap-2 p-1 bg-bg border border-border rounded-xl">
                    {(['deadline', 'start-date'] as const).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          const items = editingTemplate.items.map(item => ({
                            ...item,
                            parentPoint: (type === 'deadline' ? 'deadline' : 'start') as 'deadline' | 'start',
                            offsetDirection: (type === 'deadline' ? 'before' : 'after') as 'before' | 'after',
                            targetPoint: (type === 'deadline' ? 'deadline' : 'start') as 'deadline' | 'start'
                          }));
                          setEditingTemplate({...editingTemplate, baseType: type, items});
                        }}
                        className={cn(
                          "flex-1 py-3 text-[10px] font-bold uppercase rounded-lg transition-all",
                          editingTemplate.baseType === type 
                            ? "bg-accent text-text-on-accent shadow-lg shadow-accent/20 scale-[1.02]" 
                            : "text-text-secondary hover:text-text-primary"
                        )}
                      >
                        {type === 'deadline' ? t.deadlineBase : t.startDateBase}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-bg border border-border rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-text-secondary mb-1 tracking-widest">{t.useStatusManagement}</label>
                      <p className="text-[9px] text-text-secondary opacity-60">各タスクに個別のステータスを設定できるようにします</p>
                    </div>
                    <button
                      onClick={() => setEditingTemplate({...editingTemplate, statusEnabled: !editingTemplate.statusEnabled, statusSetId: !editingTemplate.statusEnabled ? statusSets[0]?.id || null : null})}
                      className={cn(
                        "relative w-12 h-6 rounded-full transition-colors",
                        editingTemplate.statusEnabled ? "bg-accent" : "bg-border"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        editingTemplate.statusEnabled ? "left-7" : "left-1"
                      )} />
                    </button>
                  </div>

                  {editingTemplate.statusEnabled && (
                    <div className="pt-2 border-t border-border/50">
                      <label className="block text-[10px] font-bold uppercase text-text-secondary mb-2 tracking-widest">{t.selectStatusSet}</label>
                      <select
                        value={editingTemplate.statusSetId || ''}
                        onChange={e => setEditingTemplate({...editingTemplate, statusSetId: e.target.value})}
                        className="w-full bg-surface border border-border rounded-lg px-4 py-2 text-xs text-text-primary outline-none focus:border-accent appearance-none cursor-pointer"
                      >
                        <option value="">{t.selectStatusSet}</option>
                        {statusSets.map(set => (
                          <option key={set.id} value={set.id}>{set.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.templateItems}</label>
                    <button 
                      onClick={() => {
                        const isDeadline = editingTemplate.baseType === 'deadline';
                        const newItem: TemplateItem = { 
                          id: generateId(), 
                          title: 'Subtask', 
                          parentId: null, 
                          offsetDays: 0, 
                          offsetDirection: isDeadline ? 'before' : 'after',
                          parentPoint: isDeadline ? 'deadline' : 'start',
                          targetPoint: isDeadline ? 'deadline' : 'start',
                          leadTime: 1 
                        };
                        setEditingTemplate({...editingTemplate, items: [...editingTemplate.items, newItem]});
                      }}
                      className="text-xs text-accent font-black py-2.5 px-6 bg-accent/5 border-2 border-accent/20 rounded-full flex items-center gap-2 transition-all hover:bg-accent hover:text-text-on-accent hover:border-accent hover:shadow-lg hover:shadow-accent/20 active:scale-[0.95]"
                    >
                      <Plus size={16} strokeWidth={3} /> {t.addTemplateItem}
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    {editingTemplate.items.map((item, idx) => (
                      <div key={item.id} className="relative p-6 bg-surface border border-border rounded-2xl space-y-4 group/item hover:border-accent/40 transition-all">
                        <div className="flex items-center gap-4">
                          <label className="w-24 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.title}</label>
                          <input 
                            value={item.title}
                            onChange={e => {
                              const items = [...editingTemplate.items];
                              items[idx] = {...item, title: e.target.value};
                              setEditingTemplate({...editingTemplate, items});
                            }}
                            className="flex-1 bg-bg border border-border rounded-lg px-4 py-2 text-xs text-text-primary focus:border-accent outline-none transition-colors"
                          />
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="w-24 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.parentContext}</label>
                          <select
                            value={item.parentId || ''}
                            onChange={e => {
                              const items = [...editingTemplate.items];
                              items[idx] = {...item, parentId: e.target.value || null};
                              setEditingTemplate({...editingTemplate, items});
                            }}
                            className="flex-1 bg-bg border border-border rounded-lg px-4 py-2 text-xs text-text-primary cursor-pointer outline-none transition-colors focus:border-accent appearance-none"
                          >
                            <option value="">{editingTemplate.baseType === 'deadline' ? `(${t.deadline})` : `(${t.startPoint})`}</option>
                            {editingTemplate.items.filter(i => i.id !== item.id).map(i => (
                              <option key={i.id} value={i.id}>{i.title}</option>
                            ))}
                          </select>
                        </div>

                        <div className="p-4 bg-bg rounded-xl border border-border space-y-4">
                          <div className="flex items-center gap-4">
                            <label className="w-24 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.calcBase}</label>
                            <div className="flex-1 flex gap-2 items-center">
                              <span className="text-[10px] font-bold uppercase text-text-primary whitespace-nowrap">
                                {item.parentId 
                                  ? (editingTemplate.baseType === 'deadline' ? t.parentPoint + t.deadlinePoint : t.parentPoint + t.startPoint)
                                  : (editingTemplate.baseType === 'deadline' ? t.deadline : t.startPoint)}
                              </span>
                              <span className="text-text-secondary text-[10px]">の</span>
                              <div className="flex bg-surface rounded p-0.5 border border-border">
                                <input 
                                  type="number" 
                                  min="0"
                                  value={item.offsetDays} 
                                  onChange={e => {
                                    const items = [...editingTemplate.items];
                                    items[idx] = {...item, offsetDays: Math.max(0, parseInt(e.target.value) || 0)};
                                    setEditingTemplate({...editingTemplate, items});
                                  }}
                                  className="w-12 bg-transparent text-center text-[10px] font-bold outline-none" 
                                />
                              </div>
                              <span className="text-text-secondary text-[10px]">営業日</span>
                              <select 
                                value={item.offsetDirection}
                                onChange={e => {
                                  const items = [...editingTemplate.items];
                                  items[idx] = {...item, offsetDirection: e.target.value as any};
                                  setEditingTemplate({...editingTemplate, items});
                                }}
                                className="bg-surface border border-border rounded px-2 py-1 text-[10px] uppercase font-bold"
                              >
                                <option value="after">{t.offsetAfter}</option>
                                <option value="before">{t.offsetBefore}</option>
                              </select>
                              <span className="text-text-secondary text-[10px]">が</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="w-24" />
                            <div className="flex-1 flex gap-2 items-center">
                              <span className="text-text-secondary text-[10px]">{t.targetPoint}</span>
                              <select 
                                value={item.targetPoint}
                                onChange={e => {
                                  const items = [...editingTemplate.items];
                                  items[idx] = {...item, targetPoint: e.target.value as any};
                                  setEditingTemplate({...editingTemplate, items});
                                }}
                                className="bg-accent/10 border border-accent/20 text-accent rounded px-2 py-1 text-[10px] uppercase font-bold"
                              >
                                <option value="start">{t.startPoint}</option>
                                <option value="deadline">{t.deadlinePoint}</option>
                              </select>
                              <span className="text-text-secondary text-[10px]">になる</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="w-24 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.leadTimeDays}</label>
                          <input 
                            type="number"
                            value={item.leadTime}
                            onChange={e => {
                              const items = [...editingTemplate.items];
                              items[idx] = {...item, leadTime: parseInt(e.target.value) || 0};
                              setEditingTemplate({...editingTemplate, items});
                            }}
                            className="flex-1 bg-bg border border-border rounded-lg px-4 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.description}</label>
                          <textarea 
                            value={item.description || ''}
                            onChange={e => {
                              const items = [...editingTemplate.items];
                              items[idx] = {...item, description: e.target.value};
                              setEditingTemplate({...editingTemplate, items});
                            }}
                            className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-[11px] text-text-primary focus:border-accent outline-none transition-colors min-h-[60px] resize-y"
                            placeholder="Markdown manual..."
                          />
                        </div>

                        <button 
                          onClick={() => {
                            setEditingTemplate({...editingTemplate, items: editingTemplate.items.filter(i => i.id !== item.id)});
                          }}
                          className="absolute -top-3 -right-3 bg-surface border border-border text-text-secondary hover:text-red-400 p-2.5 rounded-full shadow-xl opacity-0 group-hover/item:opacity-100 transition-all z-10 hover:scale-110 active:scale-95 border-red-400/20"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    {editingTemplate.items.length > 0 && (
                      <div className="flex justify-center pt-2">
                        <button 
                          onClick={() => {
                            const isDeadline = editingTemplate.baseType === 'deadline';
                            const newItem: TemplateItem = { 
                              id: generateId(), 
                              title: 'Subtask', 
                              parentId: null, 
                              offsetDays: 0, 
                              offsetDirection: isDeadline ? 'before' : 'after',
                              parentPoint: isDeadline ? 'deadline' : 'start',
                              targetPoint: isDeadline ? 'deadline' : 'start',
                              leadTime: 1 
                            };
                            setEditingTemplate({...editingTemplate, items: [...editingTemplate.items, newItem]});
                          }}
                          className="w-12 h-12 flex items-center justify-center bg-accent/5 border-2 border-dashed border-accent/20 text-accent rounded-full hover:bg-accent hover:text-text-on-accent hover:border-accent transition-all hover:scale-110 active:scale-90"
                        >
                          <Plus size={24} strokeWidth={3} />
                        </button>
                      </div>
                    )}
                  </div>

                  {editingTemplate.items.length === 0 && (
                    <div className="py-20 text-center border-2 border-dashed border-border rounded-2xl bg-bg/20">
                      <p className="text-[11px] text-text-secondary uppercase tracking-widest mb-4 opacity-50">No items defined</p>
                      <button 
                        onClick={() => {
                          const isDeadline = editingTemplate.baseType === 'deadline';
                          const newItem: TemplateItem = { id: generateId(), title: 'First Task', parentId: null, offsetDays: 0, offsetDirection: isDeadline ? 'before' : 'after', parentPoint: isDeadline ? 'deadline' : 'start', targetPoint: isDeadline ? 'deadline' : 'start', leadTime: 1 };
                          setEditingTemplate({...editingTemplate, items: [newItem]});
                        }}
                        className="text-xs text-accent font-black px-8 py-4 border-2 border-accent/20 rounded-full hover:bg-accent hover:text-text-on-accent transition-all shadow-lg shadow-accent/10 active:scale-[0.95]"
                      >
                        <Plus size={16} className="inline mr-2" strokeWidth={3} /> {t.addTemplateItem}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 sticky bottom-0 bg-surface pt-4 pb-1 border-t border-border z-20">
                  <button 
                    onClick={handleSaveEditing}
                    className="flex-1 bg-accent text-text-on-accent py-4 rounded-xl text-[11px] font-bold uppercase shadow-xl shadow-accent/20 hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    {t.saveTemplate}
                  </button>
                  <button 
                    onClick={() => setEditingTemplate(null)}
                    className="px-8 py-4 bg-bg border border-border rounded-xl text-[11px] font-bold uppercase text-text-secondary hover:bg-white/5 transition-all"
                  >
                    {t.discard}
                  </button>
                </div>
              </div>

              {/* Right Column: Sticky Preview */}
              <div className="lg:w-[420px] flex flex-col gap-6">
                <div className="sticky top-0 space-y-6">
                  <TemplatePreview items={editingTemplate.items} baseType={editingTemplate.baseType} />
                  
                  <div className="bg-accent/5 border border-accent/10 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2">
                       <HelpCircle size={16} className="text-accent" />
                       <h4 className="text-[10px] font-bold uppercase text-text-primary tracking-widest">Guide</h4>
                    </div>
                    <p className="text-[11px] leading-relaxed text-text-secondary italic opacity-80 decoration-accent/20">
                      {editingTemplate.baseType === 'deadline' 
                        ? "締め切り日（基準日）に向かって、各タスクをボトムアップで積み上げます。日数は基準日から「遡る（前）」形で設定されます。"
                        : "開始日（基準日）から順次スケジュールを組み立てます。日数は基準日から「進む（後）」形で設定されます。"}
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex items-center gap-3 text-[10px] text-text-secondary">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span>垂直線は基準日（Day 0）を示します</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-text-secondary">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent/20 border border-accent/40" />
                        <span>バーの長さはリードタイム（期間）です</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map(tmp => (
                <div key={tmp.id} className="group relative p-6 bg-surface border border-border rounded-2xl hover:border-accent/40 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-sm hover:shadow-xl" onClick={() => setEditingTemplate(tmp)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-text-primary mb-2 group-hover:text-accent transition-colors">{tmp.name}</h3>
                      <div className="flex gap-3">
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-bg border border-border rounded-full">
                          <Layers size={10} className="text-text-secondary" />
                          <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">{tmp.items.length} Tasks</span>
                        </div>
                        <div className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded-full border",
                          tmp.baseType === 'deadline' 
                            ? "bg-red-400/5 border-red-400/10 text-red-400" 
                            : "bg-green-400/5 border-green-400/10 text-green-400"
                        )}>
                          <Clock size={10} />
                          <span className="text-[10px] uppercase font-bold tracking-wider">
                            {tmp.baseType === 'deadline' ? 'Reverse-Calculated' : 'Forward-Scheduled'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTemplate(tmp);
                        }}
                        className="p-3 bg-bg border border-border rounded-xl text-text-secondary hover:text-accent hover:border-accent/40 transition-all shadow-sm"
                      >
                        <Settings size={18} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(tmp.id);
                        }}
                        className="p-3 bg-bg border border-border rounded-xl text-text-secondary hover:text-red-400 hover:border-red-400/40 transition-all shadow-sm"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div className="py-24 text-center border-2 border-dashed border-border rounded-3xl bg-bg/5 space-y-6">
                  <div className="w-16 h-16 bg-bg border border-border rounded-full flex items-center justify-center mx-auto opacity-40">
                    <Layers size={24} className="text-text-secondary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-text-secondary uppercase tracking-widest">{t.noTemplates}</p>
                    <p className="text-xs text-text-secondary opacity-40 flex items-center justify-center gap-2">
                      Click the "New Template" button to get started.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {!editingTemplate && (
          <div className="mt-8 pt-8 border-t border-border flex justify-between items-center bg-surface">
            <p className="text-[10px] text-text-secondary italic max-w-[300px]">
              Templates allow you to quickly apply recurring project structures with relative lead times.
            </p>
            <button 
              onClick={onClose}
              className="px-10 py-4 bg-bg border border-border text-text-primary text-[11px] font-bold uppercase rounded-xl hover:bg-white/10 shadow-sm transition-all active:scale-95"
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
  const [statusSets, setStatusSets] = useState<StatusSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isHolidayManagerOpen, setIsHolidayManagerOpen] = useState(false);
  const [isStatusManagerOpen, setIsStatusManagerOpen] = useState(false);
  const [holidayDate, setHolidayDate] = useState<string>('');
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingInstanceDate, setEditingInstanceDate] = useState<string | null>(null);
  const [editChoiceTarget, setEditChoiceTarget] = useState<{ task: Task; originalDate?: string } | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateDeadline, setTemplateDeadline] = useState<string>('');
  const [templateRecType, setTemplateRecType] = useState<RecurrenceType>('none');
  const [templateWeeklyDays, setTemplateWeeklyDays] = useState<number[]>([]);
  const [templateMonthlyDays, setTemplateMonthlyDays] = useState<(number | string)[]>([]);
  const [templateInterval, setTemplateInterval] = useState<number>(1);
  const [templateMonths, setTemplateMonths] = useState<number[]>([]);
  const [templateHolidayAdjustment, setTemplateHolidayAdjustment] = useState<HolidayAdjustment>('next');
  const [templateBaseDate, setTemplateBaseDate] = useState<string>(''); // For single template application
  const [formMode, setFormMode] = useState<'normal' | 'template'>('normal');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ganttflow_theme') as 'dark' | 'light') || 'dark';
  });
  
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [mousePos, setMousePos] = useState(0);
  const [pendingChange, setPendingChange] = useState<{ id: string; baseDate: string; leadTime: number; originalDate?: string } | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ganttflow_theme', theme);
  }, [theme]);

  // Form State
  const [recType, setRecType] = useState<RecurrenceType>('none');
  const [weeklyDays, setWeeklyDays] = useState<number[]>([]);
  const [monthlyDays, setMonthlyDays] = useState<(number | 'first-business-day' | 'last-business-day' | string)[]>([]);
  const [interval, setIntervalValue] = useState<number>(1);
  const [months, setMonths] = useState<number[]>([]);
  const [holidayAdjustment, setHolidayAdjustment] = useState<HolidayAdjustment>('next');
  const [manualBaseType, setManualBaseType] = useState<'start-date' | 'deadline'>('start-date');
  const [manualBaseDate, setManualBaseDate] = useState<string>('');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [isIndefinite, setIsIndefinite] = useState(false);
  const [description, setDescription] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [viewingDescriptionTask, setViewingDescriptionTask] = useState<Task | null>(null);

  useEffect(() => {
    if (editingTask) {
      setRecType(editingTask.recurrence.type);
      setWeeklyDays(editingTask.recurrence.weeklyDays || []);
      setMonthlyDays(editingTask.recurrence.monthlyDays || []);
      setIntervalValue(editingTask.recurrence.interval || 1);
      setMonths(editingTask.recurrence.months || []);
      setHolidayAdjustment(editingTask.recurrence.holidayAdjustment || 'next');
      setManualBaseType(editingTask.baseType || 'start-date');
      setManualBaseDate(editingTask.baseDate || '');
      setFormParentId(editingTask.parentId);
      setIsIndefinite(editingTask.isIndefinite || false);
      setDescription(editingTask.description || '');
      setIsPreviewMode(false);
    } else {
      setRecType('none');
      setWeeklyDays([]);
      setMonthlyDays([]);
      setIntervalValue(1);
      setMonths([]);
      setHolidayAdjustment('next');
      setManualBaseType('start-date');
      setManualBaseDate('');
      setFormParentId(null);
      setIsIndefinite(false);
      setDescription('');
      setIsPreviewMode(false);
    }
  }, [editingTask, isFormOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFormOpen) {
          setIsFormOpen(false);
          setEditingTask(null);
        } else if (isHolidayManagerOpen) {
          setIsHolidayManagerOpen(false);
        } else if (viewingDescriptionTask) {
          setViewingDescriptionTask(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFormOpen, isHolidayManagerOpen, viewingDescriptionTask]);

  // Persistence
  useEffect(() => {
    const loadData = async () => {
      try {
        const [tasksRes, holidaysRes, templatesRes, statusSetsRes] = await Promise.all([
          fetch('/api/tasks'),
          fetch('/api/holidays'),
          fetch('/api/templates'),
          fetch('/api/status-sets')
        ]);
        const [tasksData, holidaysData, templatesData, statusSetsData] = await Promise.all([
          tasksRes.json(),
          holidaysRes.json(),
          templatesRes.json(),
          statusSetsRes.json()
        ]);
        setTasks(tasksData);
        setHolidays(holidaysData);
        setTemplates(templatesData);
        setStatusSets(statusSetsData);
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

  const saveStatusSets = async (newSets: StatusSet[]) => {
    try {
      await fetch('/api/status-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSets)
      });
    } catch (err) {
      console.error('Failed to save status sets:', err);
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

  useEffect(() => {
    if (!loading) saveStatusSets(statusSets);
  }, [statusSets, loading]);

  const hierarchicalTasks = useMemo(() => {
    const startM = startOfMonth(currentMonth);
    const endM = endOfMonth(currentMonth);

    const getEntries = (parentId: string | null, level: number, parentInstanceDate?: string): { task: Task; instance: any; level: number; idHash: string }[] => {
      const filtered = tasks.filter(t => t.parentId === parentId);
      let entries: { task: Task; instance: any; level: number; idHash: string }[] = [];

      filtered.forEach(task => {
        // Indefinite tasks are always shown regardless of month
        if (task.isIndefinite) {
          const idHash = `${task.id}-indefinite`;
          entries.push({ task, instance: { start: startM, end: endM, originalDate: undefined }, level, idHash });
          if (expandedIds.has(idHash)) {
            entries = [...entries, ...getEntries(task.id, level + 1, undefined)];
          }
          return;
        }

        // Determine search window:
        // - For child lookups (parentInstanceDate set): search around the parent instance date
        // - For root-level tasks: search ±90 days around the current month, to find parent instances
        //   from adjacent months whose child tasks fall in the current month (cross-month sets)
        const searchStart = parentInstanceDate ? addDays(parseISO(parentInstanceDate), -180) : addDays(startM, -90);
        const searchEnd = parentInstanceDate ? addDays(parseISO(parentInstanceDate), 180) : addDays(endM, 90);
        const allInstances = calculateTaskInstances(task, searchStart, searchEnd, holidays, tasks);

        // Match instances to the specific parent branch if applicable
        const relevantInstances = parentInstanceDate
          ? allInstances.filter(inst => {
              // Dynamic child: originalDate matches parent's instance date
              if (inst.originalDate === parentInstanceDate) return true;

              // Static child (no offsetDays saved): match by proximity.
              // Find all parent instances in a wide range, then show this child
              // only under the nearest parent instance to avoid duplicates.
              if (task.offsetDays === undefined && task.parentId && inst.originalDate) {
                const parentTask = tasks.find(t => t.id === task.parentId);
                if (parentTask && parentTask.recurrence?.type !== 'none') {
                  const parentInsts = calculateTaskInstances(
                    parentTask,
                    addDays(parseISO(inst.originalDate), -90),
                    addDays(parseISO(inst.originalDate), 90),
                    holidays,
                    tasks
                  );
                  if (parentInsts.length > 0) {
                    const childDate = parseISO(inst.originalDate);
                    const nearest = parentInsts.reduce((best, pi) => {
                      const d = Math.abs(pi.start.getTime() - childDate.getTime());
                      const bd = Math.abs(best.start.getTime() - childDate.getTime());
                      return d < bd ? pi : best;
                    });
                    return nearest.originalDate === parentInstanceDate;
                  }
                }
                // Non-recurring parent: always show static child when parent is expanded
                return true;
              }
              return false;
            })
          : allInstances.filter(inst => {
              // Always include instances whose parent bar overlaps the current month
              if (inst.start <= endM && inst.end >= startM) return true;

              // For instances outside the current month (e.g., previous month's parent),
              // include them only if at least one direct child falls in the current month.
              const directChildren = tasks.filter(t => t.parentId === task.id);
              if (directChildren.length === 0) return false;
              const instDate = inst.originalDate;
              if (!instDate) return false;

              return directChildren.some(child => {
                const childInsts = calculateTaskInstances(
                  child,
                  addDays(parseISO(instDate), -180),
                  addDays(parseISO(instDate), 180),
                  holidays,
                  tasks
                );
                // Dynamic children: filter by matching originalDate
                // Static children (no offsetDays): use their baseDate directly
                const matching = child.offsetDays !== undefined
                  ? childInsts.filter(ci => ci.originalDate === instDate)
                  : childInsts;
                return matching.some(ci => ci.start <= endM && ci.end >= startM);
              });
            });

        relevantInstances.forEach(inst => {
          const idHash = `${task.id}-${inst.originalDate || '0'}`;

          // Apply overrides for this instance
          const mergedTask = inst.originalDate && task.overrides?.[inst.originalDate]
            ? { ...task, ...task.overrides[inst.originalDate] }
            : task;

          entries.push({
            task: mergedTask,
            instance: inst,
            level,
            idHash
          });

          if (expandedIds.has(idHash)) {
            entries = [...entries, ...getEntries(task.id, level + 1, inst.originalDate)];
          }
        });
      });
      return entries;
    };

    return getEntries(null, 0);
  }, [tasks, expandedIds, currentMonth, holidays]);

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

  const handleDateClick = (date: Date) => {
    const formattedDate = format(date, 'yyyy-MM-dd');
    setManualBaseDate(formattedDate);
    setTemplateBaseDate(formattedDate);
    setManualBaseType('start-date');
    setFormMode('normal');
    setEditingTask(null);
    setIsFormOpen(true);
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    
    // Smooth scroll to today
    setTimeout(() => {
      if (ganttRef.current) {
        const startOfView = startOfMonth(today);
        const diff = differenceInDays(startOfDay(today), startOfView);
        const scrollPos = diff * dayWidth - (ganttRef.current.clientWidth / 2) + (dayWidth / 2);
        // Important: target the SECTION with overflow-x-auto, not the ganttRef which is overflow-y
        ganttRef.current.closest('section')?.scrollTo({ left: scrollPos, behavior: 'smooth' });
      }
    }, 100);
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

  const handleApplyTemplate = (templateId: string, baseDateStr: string, recurrence?: RecurrenceRule) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    let baseDate: Date;
    // parseISO ensures "2023-10-10" is local 00:00:00, not UTC
    if (baseDateStr) {
      baseDate = startOfDay(parseISO(baseDateStr));
    } else if (recurrence && recurrence.type !== 'none') {
      const today = startOfDay(new Date());
      const oneYearLater = addDays(today, 365);
      const dummyTask: Task = {
        id: 'dummy',
        title: 'dummy',
        parentId: null,
        leadTime: 0,
        recurrence: recurrence,
        isCompleted: false,
        createdAt: Date.now()
      };
      const instances = calculateTaskInstances(dummyTask, today, oneYearLater, holidays, tasks);
      if (instances.length > 0) {
        baseDate = instances[0].start;
      } else {
        baseDate = today;
      }
    } else {
      return;
    }

    const newTasksAdded: Task[] = [];
    
    // Internal helper to avoid state issues during loop
    const createLocalTask = (data: Partial<Task>): Task => {
      const task: Task = {
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
      newTasksAdded.push(task);
      return task;
    };

    const initialStatusId = template.statusEnabled && template.statusSetId 
      ? statusSets.find(s => s.id === template.statusSetId)?.statuses[0]?.id 
      : undefined;

    const parentTask = createLocalTask({
      title: template.name,
      recurrence: recurrence || { type: 'none' },
      baseDate: format(baseDate, 'yyyy-MM-dd'),
      baseType: template.baseType,
      leadTime: 0,
      statusId: initialStatusId,
      statusSetId: template.statusEnabled ? template.statusSetId : undefined
    });

    const itemMap = new Map<string, string>();
    const pendingItems = [...template.items];

    let progress = true;
    while (pendingItems.length > 0 && progress) {
      progress = false;
      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        
        if (!item.parentId || itemMap.has(item.parentId)) {
          let referenceDate: Date;
          let calculatedReferenceId: string | null = null;
          
          if (!item.parentId) {
            referenceDate = baseDate;
            calculatedReferenceId = parentTask.id;
          } else {
            calculatedReferenceId = itemMap.get(item.parentId)!;
            const refParentTask = [...tasks, ...newTasksAdded].find(t => t.id === calculatedReferenceId);
            
            if (refParentTask) {
              const pStart = parseISO(refParentTask.baseDate || '');
              const pEnd = calculateEndDate(pStart, refParentTask.leadTime, holidays);
              referenceDate = item.parentPoint === 'start' ? pStart : pEnd;
            } else {
              referenceDate = baseDate;
              calculatedReferenceId = parentTask.id;
            }
          }

          const offset = item.offsetDirection === 'before' ? -item.offsetDays : item.offsetDays;
          const targetDate = offset >= 0 
            ? addBusinessDays(referenceDate, offset, holidays)
            : subBusinessDays(referenceDate, Math.abs(offset), holidays);
          
          const newTask = createLocalTask({
            title: item.title,
            parentId: calculatedReferenceId,
            leadTime: item.leadTime,
            recurrence: { type: 'none' }, // Subtasks follow parent recurrence dynamically now
            baseDate: format(targetDate, 'yyyy-MM-dd'),
            baseType: item.targetPoint === 'start' ? 'start-date' : 'deadline',
            offsetDays: item.offsetDays,
            offsetDirection: item.offsetDirection,
            parentPoint: item.parentPoint,
            description: item.description,
            statusId: initialStatusId,
            statusSetId: template.statusEnabled ? template.statusSetId : undefined
          });
          itemMap.set(item.id, newTask.id);
          pendingItems.splice(i, 1);
          i--;
          progress = true;
        }
      }
    }

    // Handle orphans
    pendingItems.forEach(item => {
      const offset = item.offsetDirection === 'before' ? -item.offsetDays : item.offsetDays;
      const targetDate = offset >= 0 
        ? addBusinessDays(baseDate, offset, holidays)
        : subBusinessDays(baseDate, Math.abs(offset), holidays);
      
      createLocalTask({
        title: item.title,
        parentId: parentTask.id,
        leadTime: item.leadTime,
        recurrence: { type: 'none' },
        baseDate: format(targetDate, 'yyyy-MM-dd'),
        baseType: item.targetPoint === 'start' ? 'start-date' : 'deadline',
        offsetDays: item.offsetDays,
        offsetDirection: item.offsetDirection,
        parentPoint: item.parentPoint,
        description: item.description
      });
    });

    setTasks(prev => [...prev, ...newTasksAdded]);
    setExpandedIds(prev => {
      const next = new Set(prev);
      newTasksAdded.forEach(t => {
        // Use the same idHash logic as hierarchicalTasks for initial expansion
        // For non-recurring tasks, originalDate defaults to the baseDate
        const hash = `${t.id}-${t.baseDate || '0'}`;
        next.add(hash);
      });
      return next;
    });

    setIsFormOpen(false);
    setSelectedTemplateId('');
    setTemplateBaseDate('');
    setTemplateRecType('none');
    setTemplateWeeklyDays([]);
    setTemplateMonthlyDays([]);
    setTemplateInterval(1);
    setTemplateMonths([]);
    setTemplateHolidayAdjustment('next');
  };

  const handleUpdateTask = (id: string, data: Partial<Task>, originalDate?: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;

      const targetDate = originalDate || editingInstanceDate;

      if (targetDate && (t.recurrence.type !== 'none' || t.parentId)) {
        const overrides = { ...(t.overrides || {}) };
        overrides[targetDate] = {
          ...overrides[targetDate],
          ...data,
        };
        return { ...t, overrides };
      }
      return { ...t, ...data };
    }));
    setEditingTask(null);
    setEditingInstanceDate(null);
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id && t.parentId !== id));
  };

  const toggleComplete = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted } : t));
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos(e.clientX);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const diffX = e.clientX - dragState.startX;
      const daysDiff = Math.round(diffX / dayWidth);
      
      if (daysDiff === 0) {
        setDragState(null);
        return;
      }

      const task = tasks.find(t => t.id === dragState.taskId);
      if (!task) {
        setDragState(null);
        return;
      }

      let newBaseDate = task.baseDate || '';
      let newLeadTime = task.leadTime;

      if (dragState.type === 'move') {
        const currentStart = parseISO(dragState.initialBaseDate);
        const nextStart = daysDiff >= 0 
          ? addBusinessDays(currentStart, daysDiff, holidays)
          : subBusinessDays(currentStart, Math.abs(daysDiff), holidays);
        newBaseDate = format(nextStart, 'yyyy-MM-dd');
      } else if (dragState.type === 'resize') {
        newLeadTime = Math.max(1, dragState.initialLeadTime + daysDiff);
      }

      setPendingChange({ 
        id: task.id, 
        baseDate: newBaseDate, 
        leadTime: newLeadTime,
        originalDate: dragState.originalDate 
      });
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, holidays, tasks]);

  const handleConfirmChange = () => {
    if (!pendingChange) return;
    setTasks(tasks.map(t => {
      if (t.id !== pendingChange.id) return t;

      if (pendingChange.originalDate) {
        const overrides = { ...(t.overrides || {}) };
        overrides[pendingChange.originalDate] = {
          ...overrides[pendingChange.originalDate],
          baseDate: pendingChange.baseDate,
          leadTime: pendingChange.leadTime
        };
        return { ...t, overrides };
      }
      
      return { ...t, baseDate: pendingChange.baseDate, leadTime: pendingChange.leadTime };
    }));
    setPendingChange(null);
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
    <div className={cn("flex h-screen bg-bg text-text-primary font-sans selection:bg-accent selection:text-black", dragState && "unselectable")}>
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
        <button 
          onClick={() => setIsStatusManagerOpen(true)}
          className="flex items-center gap-3 w-full px-5 py-3 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          <Settings size={14} /> <span>{t.statusManage}</span>
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
                <div className="mx-3 w-[1px] h-3 bg-border/50" />
                <button 
                  onClick={handleGoToToday}
                  className="px-3 py-1 bg-accent/10 border border-accent/20 text-[10px] font-black uppercase tracking-tighter text-accent hover:bg-accent hover:text-text-on-accent rounded-md transition-all active:scale-95"
                >
                  {t.today}
                </button>
              </div>
            </div>
            <div 
              ref={listRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto scrollbar-hide"
            >
              {hierarchicalTasks.map(({ task, instance, level, idHash }) => (
                <TaskRow 
                  key={idHash} 
                  task={task} 
                  level={level} 
                  isExpanded={expandedIds.has(idHash)}
                  statusSets={statusSets}
                  hasChildren={tasks.some(t => t.parentId === task.id)}
                  instanceDate={instance.originalDate}
                  onToggle={() => toggleExpand(idHash)}
                  onDelete={deleteTask}
                  onComplete={toggleComplete}
                  onEdit={(t: Task, originalDate?: string) => { 
                    if (t.recurrence.type !== 'none') {
                      setEditChoiceTarget({ task: t, originalDate: originalDate || instance.originalDate });
                    } else {
                      setEditingTask(t); 
                      setEditingInstanceDate(instance.originalDate || null);
                      setIsFormOpen(true); 
                    }
                  }}
                  onUpdate={(id, data) => handleUpdateTask(id, data, instance.originalDate)}
                  onViewDescription={setViewingDescriptionTask}
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
                        onClick={() => handleDateClick(date)}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center justify-center border-r border-border/50 transition-colors cursor-pointer hover:bg-accent/10",
                          isHoli && "bg-holiday/30",
                          isWe && "bg-weekend/50",
                          isToday && "bg-accent/10 ring-1 ring-inset ring-accent/30"
                        )}
                        style={{ width: `${dayWidth}px` }}
                      >
                        <span className={cn(
                          "text-[9px] font-bold uppercase",
                          isToday ? "text-accent" : (isHoli ? "text-red-400" : "text-text-secondary")
                        )}>
                          {dayNames[date.getDay()]}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold",
                          isToday ? "text-accent border-b-2 border-accent" : "text-text-secondary"
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
                <div className="absolute inset-0 flex min-h-full">
                  {timelineDates.map(date => (
                    <div 
                      key={date.toISOString()}
                      onClick={() => handleDateClick(date)}
                      className={cn(
                        "flex-shrink-0 border-r border-border/30 transition-colors cursor-pointer hover:bg-accent/5",
                        isHoliday(date, holidays) && "bg-holiday/10",
                        isWeekend(date) && "bg-weekend/20",
                        isSameDay(date, new Date()) && "bg-accent/5 ring-1 ring-inset ring-accent/20",
                        date < startOfDay(new Date()) && "bg-black/10"
                      )}
                      style={{ width: `${dayWidth}px` }}
                    />
                  ))}
                </div>

                {/* Task Bars */}
                <div className="relative z-0">
                  {hierarchicalTasks.map(({ task, instance, idHash }) => {
                    const startOfMonthView = startOfMonth(currentMonth);
                    const endOfMonthView = endOfMonth(currentMonth);

                    // Find all descendants recursively to calculate parent range
                    const getDescendantInstances = (parentId: string, parentInstDate?: string): { start: Date; end: Date }[] => {
                      const children = tasks.filter(t => t.parentId === parentId);
                      let allInstances: { start: Date; end: Date }[] = [];
                      
                      children.forEach(child => {
                        // Expand search window so children whose dates fall outside the current month
                        // (but belong to a parent instance in this month) are still found.
                        const childSearchStart = parentInstDate ? addDays(parseISO(parentInstDate), -180) : startOfMonthView;
                        const childSearchEnd = parentInstDate ? addDays(parseISO(parentInstDate), 180) : endOfMonthView;
                        const childInstances = calculateTaskInstances(child, childSearchStart, childSearchEnd, holidays, tasks);
                        const relevant = parentInstDate
                          ? childInstances.filter(ci => {
                              if (ci.originalDate === parentInstDate) return true;
                              // Static child (no offsetDays): include if nearest parent instance matches
                              if (child.offsetDays === undefined && child.parentId && ci.originalDate) {
                                const parentTask = tasks.find(t => t.id === child.parentId);
                                if (parentTask && parentTask.recurrence?.type !== 'none') {
                                  const pInsts = calculateTaskInstances(parentTask, addDays(parseISO(ci.originalDate), -90), addDays(parseISO(ci.originalDate), 90), holidays, tasks);
                                  if (pInsts.length > 0) {
                                    const childDate = parseISO(ci.originalDate);
                                    const nearest = pInsts.reduce((best, pi) => Math.abs(pi.start.getTime() - childDate.getTime()) < Math.abs(best.start.getTime() - childDate.getTime()) ? pi : best);
                                    return nearest.originalDate === parentInstDate;
                                  }
                                }
                                return true;
                              }
                              return false;
                            })
                          : childInstances;
                        allInstances = [...allInstances, ...relevant];
                        relevant.forEach(ri => {
                          allInstances = [...allInstances, ...getDescendantInstances(child.id, ri.originalDate)];
                        });
                      });
                      
                      return allInstances;
                    };

                    const ownInstances = instance ? [instance] : calculateTaskInstances(task, startOfMonthView, endOfMonthView, holidays, tasks);
                    const descendantInstances = getDescendantInstances(task.id, instance?.originalDate);
                    
                    // If it has children, the visually effective instances should cover its children
                    const visualInstances = ownInstances.map(own => {
                      // With the new instance-based list, a parent row already corresponds to a specific instance.
                      // So we only need to combine with descendants that belong to THAT specific instance branch.
                      const relevantDescendants = descendantInstances;

                      if (relevantDescendants.length === 0) return own;

                      const minStart = new Date(Math.min(own.start.getTime(), ...relevantDescendants.map(d => d.start.getTime())));
                      const maxEnd = new Date(Math.max(own.end.getTime(), ...relevantDescendants.map(d => d.end.getTime())));
                      
                      return { start: minStart, end: maxEnd, originalDate: own.originalDate };
                    });

                    const displayedInstances = (visualInstances.length > 0 ? visualInstances : (
                      descendantInstances.length > 0 ? [{
                        start: new Date(Math.min(...descendantInstances.map(d => d.start.getTime()))),
                        end: new Date(Math.max(...descendantInstances.map(d => d.end.getTime())))
                      }] : []
                    )).filter(inst => inst.start <= endOfMonthView && inst.end >= startOfMonthView);

                    return (
                      <div key={idHash} className="h-[44px] flex items-center relative group pointer-events-none">
                        {displayedInstances.map((instance, idx) => {
                          const displayStart = new Date(Math.max(startOfDay(instance.start).getTime(), startOfMonthView.getTime()));
                          const displayEnd = new Date(Math.min(startOfDay(instance.end).getTime(), endOfMonthView.getTime()));
                          const startOffset = differenceInDays(displayStart, startOfMonthView);
                          const duration = differenceInDays(displayEnd, displayStart) + 1;
                          
                          const hasChildren = tasks.some(t => t.parentId === task.id);

                          return (
                            <React.Fragment key={idx}>
                              {dragState?.taskId === task.id && (
                                <div 
                                  className="absolute h-6 rounded-md bg-accent/20 border-2 border-dashed border-accent z-20 pointer-events-none"
                                  style={{
                                    left: `${(startOffset + (dragState.type === 'move' ? Math.round((mousePos - dragState.startX) / dayWidth) : 0)) * dayWidth}px`,
                                    width: `${(duration + (dragState.type === 'resize' ? Math.round((mousePos - dragState.startX) / dayWidth) : 0)) * dayWidth - 4}px`,
                                    top: '10px'
                                  }}
                                />
                              )}
                              <motion.div
                                onMouseDown={(e) => {
                                  if (hasChildren) return;
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const offsetX = e.clientX - rect.left;
                                  const isResize = rect.width - offsetX < 15;
                                  setDragState({
                                    taskId: task.id,
                                    originalDate: (instance as any).originalDate,
                                    type: isResize ? 'resize' : 'move',
                                    startX: e.clientX,
                                    initialBaseDate: format(instance.start, 'yyyy-MM-dd'),
                                    initialLeadTime: task.leadTime
                                  });
                                  setMousePos(e.clientX);
                                }}
                                onClick={(e) => { 
                                  // Modal only opens via settings icon in task list
                                }}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                  "absolute h-6 rounded-md shadow-lg cursor-grab active:cursor-grabbing hover:brightness-110 active:scale-[0.98] transition-all flex items-center px-3 z-10 pointer-events-auto",
                                  task.isCompleted ? "opacity-30 grayscale" : "",
                                  hasChildren ? "h-2 mt-2 cursor-default" : "",
                                  dragState?.taskId === task.id ? "ring-2 ring-accent opacity-70 cursor-grabbing" : ""
                                )}
                                style={{ 
                                  left: `${startOffset * dayWidth}px`, 
                                  width: `${duration * dayWidth - 4}px`,
                                  backgroundColor: hasChildren ? '#333' : (
                                    task.statusSetId 
                                      ? (statusSets.find(s => s.id === task.statusSetId)?.statuses.find(st => st.id === task.statusId)?.color || task.color || '#4da6ff')
                                      : (task.color || '#4da6ff')
                                  ),
                                  top: '10px',
                                  boxShadow: hasChildren ? 'none' : `0 4px 12px ${task.color}33`,
                                  borderLeft: hasChildren ? `2px solid #000` : 'none',
                                  borderRight: hasChildren ? `2px solid #000` : 'none',
                                  borderRadius: hasChildren ? '0' : '6px'
                                }}
                                title={`${task.title} (${format(instance.start, 'MMM d')} - ${format(instance.end, 'MMM d')})`}
                              >
                                {!hasChildren && (
                                  <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 transition-colors rounded-r-md" />
                                )}
                                {!hasChildren && (
                                  <div className="flex items-center gap-2 w-full overflow-hidden">
                                    {task.statusSetId && (
                                      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <StatusBadge task={task} statusSets={statusSets} onUpdate={(id, data) => handleUpdateTask(id, data, instance?.originalDate)} />
                                      </div>
                                    )}
                                    <span className="text-[11px] truncate text-black font-bold tracking-tight">
                                      {task.title}
                                    </span>
                                    {task.isIndefinite && (
                                      <div className="flex-shrink-0 bg-black/10 rounded px-1">
                                        <InfinityIcon size={12} className="text-black/60" />
                                      </div>
                                    )}
                                  </div>
                                )}
                                {hasChildren && (
                                  <>
                                    <div className="absolute -bottom-1 left-0 w-1 h-3 bg-black transform -translate-y-1/2" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                                    <div className="absolute -bottom-1 right-0 w-1 h-3 bg-black transform -translate-y-1/2" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                                  </>
                                )}
                              </motion.div>
                            </React.Fragment>
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
        {isStatusManagerOpen && (
          <StatusSetManager
            statusSets={statusSets}
            onSave={setStatusSets}
            onClose={() => setIsStatusManagerOpen(false)}
          />
        )}
        {editChoiceTarget && (
          <EditModeDialog 
            onSelect={(mode) => {
              const { task, originalDate } = editChoiceTarget;
              if (mode === 'individual') {
                const dateKey = originalDate || task.baseDate || format(new Date(), 'yyyy-MM-dd');
                setEditingInstanceDate(dateKey);
                // Load merged data for form
                const merged = { ...task, ...(task.overrides?.[dateKey] || {}) };
                setEditingTask(merged);
              } else {
                setEditingInstanceDate(null);
                setEditingTask(task);
              }
              setEditChoiceTarget(null);
              setIsFormOpen(true);
            }}
            onCancel={() => setEditChoiceTarget(null)}
          />
        )}

        {pendingChange && (
          <ConfirmDialog 
            title={t.confirmChange}
            pendingChange={pendingChange}
            tasks={tasks}
            onConfirm={handleConfirmChange}
            onCancel={() => setPendingChange(null)}
          />
        )}

        <AnimatePresence>
          {viewingDescriptionTask && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-3xl bg-surface border border-border rounded-2xl shadow-2xl p-8 flex flex-col max-h-[85vh]"
              >
                <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center">
                      <FileText className="text-accent" size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-text-primary">{viewingDescriptionTask.title}</h2>
                      <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">{t.description}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setViewingDescriptionTask(null)}
                    className="p-2 text-text-secondary hover:text-text-primary transition-colors bg-bg rounded-lg border border-border"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                  <div className="markdown-body p-6 bg-bg/30 rounded-xl border border-border/50">
                    <ReactMarkdown>
                      {viewingDescriptionTask.description || ''}
                    </ReactMarkdown>
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => setViewingDescriptionTask(null)}
                    className="px-8 py-3 bg-accent text-text-on-accent text-[11px] font-bold uppercase rounded-xl shadow-lg shadow-accent/20 hover:brightness-110 active:scale-95 transition-all"
                  >
                    {t.discard}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Task Form Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl p-10 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-text-primary">
                  {editingTask ? t.taskConfig : t.newTaskDef}
                </h2>
                <button 
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Trash2 size={20} className="rotate-45" />
                </button>
              </div>

              {!editingTask && (
                <div className="flex gap-1 bg-bg p-1 rounded-xl border border-border mb-8">
                  {(['normal', 'template'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setFormMode(mode)}
                      className={cn(
                        "flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all",
                        formMode === mode 
                          ? "bg-accent text-text-on-accent shadow-lg shadow-accent/20" 
                          : "text-text-secondary hover:bg-white/5"
                      )}
                    >
                      {mode === 'normal' ? t.standardRegistration : t.useTemplate}
                    </button>
                  ))}
                </div>
              )}
              
              {formMode === 'template' && !editingTask && (
                <div className="mb-0 border-b border-border pb-8 last:border-0 last:pb-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
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

                    {selectedTemplateId && (
                      <div className="flex items-center gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className={cn(
                          "w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest transition-opacity",
                          templateRecType !== 'none' && "opacity-30"
                        )}>
                          {(templates.find(t => t.id === selectedTemplateId)?.baseType === 'deadline') ? t.deadline : t.startPoint}
                        </label>
                        <DatePicker 
                          value={templateBaseDate}
                          disabled={templateRecType !== 'none'}
                          onChange={setTemplateBaseDate}
                        />
                      </div>
                    )}
                  </div>
                  {selectedTemplateId && (
                    <div className="mt-6 p-6 bg-bg/50 border border-border rounded-xl space-y-6">
                      <div className="flex-1 flex gap-2 mb-4 p-2 bg-sidebar rounded-lg border border-border">
                        <div className="text-[10px] font-bold text-accent px-3 py-1 bg-accent-soft rounded border border-accent/20">
                          {templates.find(x => x.id === selectedTemplateId)?.baseType === 'deadline' ? t.deadlineBase : t.startDateBase}
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.recurrenceModel}</label>
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-1 bg-surface p-1 rounded-lg border border-border">
                            {(['none', 'recurring'] as const).map(mode => (
                              <label key={mode} className="flex-1">
                                <input 
                                  type="radio" 
                                  name="templateRecType" 
                                  value={mode} 
                                  checked={mode === 'none' ? templateRecType === 'none' : templateRecType !== 'none'}
                                  onChange={() => {
                                    if (mode === 'none') {
                                      setTemplateRecType('none');
                                    } else if (templateRecType === 'none') {
                                      setTemplateRecType('weekly');
                                      setTemplateBaseDate('');
                                    }
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="text-center py-2 text-[10px] rounded-md cursor-pointer transition-all uppercase tracking-widest font-black peer-checked:bg-accent peer-checked:text-text-on-accent text-text-secondary hover:text-text-primary">
                                  {mode === 'none' ? t.recurrenceNone : t.recurrenceExists}
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
                          setType={setTemplateRecType}
                          weeklyDays={templateWeeklyDays}
                          setWeeklyDays={setTemplateWeeklyDays}
                          monthlyDays={templateMonthlyDays}
                          setMonthlyDays={setTemplateMonthlyDays}
                          interval={templateInterval}
                          setInterval={setTemplateInterval}
                          months={templateMonths}
                          setMonths={setTemplateMonths}
                          holidayAdjustment={templateHolidayAdjustment}
                          setHolidayAdjustment={setTemplateHolidayAdjustment}
                        />
                      </div>

                      <button 
                        onClick={() => handleApplyTemplate(selectedTemplateId, templateBaseDate, {
                          type: templateRecType,
                          weeklyDays: templateWeeklyDays,
                          monthlyDays: templateMonthlyDays as any,
                          interval: templateInterval,
                          months: templateMonths,
                          holidayAdjustment: templateHolidayAdjustment
                        })}
                        disabled={
                          !templateBaseDate && 
                          (templateRecType === 'none' || 
                           (templateRecType === 'weekly' && templateWeeklyDays.length === 0) ||
                           (templateRecType === 'monthly' && templateMonthlyDays.length === 0))
                        }
                        className={cn(
                          "w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          (templateBaseDate || (templateRecType !== 'none' && (templateWeeklyDays.length > 0 || templateMonthlyDays.length > 0)))
                            ? "bg-accent text-text-on-accent shadow-lg shadow-accent/20 hover:brightness-110 active:scale-[0.98]" 
                            : "bg-border text-text-secondary cursor-not-allowed"
                        )}
                      >
                        {templateBaseDate || (templateRecType !== 'none' && (templateWeeklyDays.length > 0 || templateMonthlyDays.length > 0))
                          ? t.applyTemplate 
                          : (templateRecType !== 'none' 
                            ? t.recurrenceRuleRequired 
                            : (templates.find(t => t.id === selectedTemplateId)?.baseType === 'deadline' ? t.deadlineRequired : t.startDateRequired))}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(formMode === 'normal' || editingTask) && (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data: Partial<Task> = {
                      title: formData.get('title') as string,
                      leadTime: isIndefinite ? 0 : (parseInt(formData.get('leadTime') as string) || 0),
                      parentId: (formData.get('parentId') as string) || null,
                      baseDate: isIndefinite ? undefined : (manualBaseDate || undefined),
                      baseType: isIndefinite ? 'start-date' : manualBaseType,
                      isIndefinite,
                      description,
                      recurrence: isIndefinite ? { type: 'none' } : {
                        type: recType,
                        weeklyDays: recType === 'weekly' ? weeklyDays : [],
                        monthlyDays: recType === 'monthly' ? monthlyDays : [],
                        interval: recType === 'monthly' ? interval : undefined,
                        months: recType === 'monthly' ? months : undefined,
                        holidayAdjustment: holidayAdjustment
                      }
                    };
                    if (editingTask) handleUpdateTask(editingTask.id, data);
                    else {
                      handleCreateTask(data);
                      setIsFormOpen(false);
                    }
                  }}
                  className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
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

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.description}</label>
                    <div className="flex bg-bg p-0.5 rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => setIsPreviewMode(false)}
                        className={cn(
                          "px-2 py-1 flex items-center gap-1.5 text-[8px] font-black uppercase rounded transition-all",
                          !isPreviewMode ? "bg-accent text-black" : "text-text-secondary hover:text-text-primary"
                        )}
                      >
                        <Edit3 size={10} /> {t.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPreviewMode(true)}
                        className={cn(
                          "px-2 py-1 flex items-center gap-1.5 text-[8px] font-black uppercase rounded transition-all",
                          isPreviewMode ? "bg-accent text-black" : "text-text-secondary hover:text-text-primary"
                        )}
                      >
                        <Eye size={10} /> {t.preview}
                      </button>
                    </div>
                  </div>
                  
                  {isPreviewMode ? (
                    <div className="min-h-[120px] max-h-[300px] overflow-y-auto bg-sidebar/50 border border-border rounded-lg px-4 py-3">
                      <div className="markdown-body">
                        <ReactMarkdown>
                          {description || `*${t.noDescription}*`}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="min-h-[120px] max-h-[300px] bg-bg border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent text-sm text-text-primary transition-colors resize-y"
                      placeholder="Markdown..."
                    />
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.indefiniteTask}</label>
                  <button
                    type="button"
                    onClick={() => setIsIndefinite(!isIndefinite)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                      isIndefinite ? "bg-accent" : "bg-border"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        isIndefinite ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                  <span className="text-[10px] font-bold text-text-secondary uppercase">{isIndefinite ? t.on : t.off}</span>
                </div>

                {!isIndefinite && (
                  <>
                    <div className="flex items-center gap-6">
                      <label className={cn(
                        "w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest transition-opacity",
                        recType !== 'none' && "opacity-30"
                      )}>
                        {recType !== 'none' ? t.deadline : (manualBaseType === 'deadline' ? t.deadline : t.startPoint)}
                      </label>
                      <div className="flex-1 flex gap-2">
                        <DatePicker 
                          value={manualBaseDate}
                          disabled={recType !== 'none'}
                          onChange={setManualBaseDate}
                        />
                        {recType === 'none' && (
                          <div className="flex bg-bg p-1 rounded-lg border border-border">
                            <button
                              type="button"
                              onClick={() => setManualBaseType('start-date')}
                              className={cn(
                                "px-3 py-1 text-[8px] font-black uppercase rounded-md transition-all",
                                manualBaseType === 'start-date' ? "bg-accent text-black" : "text-text-secondary"
                              )}
                            >
                              {t.startPoint}
                            </button>
                            <button
                              type="button"
                              onClick={() => setManualBaseType('deadline')}
                              className={cn(
                                "px-3 py-1 text-[8px] font-black uppercase rounded-md transition-all",
                                manualBaseType === 'deadline' ? "bg-accent text-black" : "text-text-secondary"
                              )}
                            >
                              {t.deadlinePoint}
                            </button>
                          </div>
                        )}
                      </div>
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
                  </>
                )}

                <div className="flex items-center gap-6">
                  <label className="w-32 flex-shrink-0 text-[10px] font-bold uppercase text-text-secondary tracking-widest">{t.parentContext}</label>
                  <select 
                    name="parentId" 
                    value={formParentId || ''}
                    onChange={(e) => setFormParentId(e.target.value || null)}
                    className="flex-1 bg-bg border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-accent text-text-primary transition-colors cursor-pointer appearance-none"
                  >
                    <option value="">{t.topLevel}</option>
                    {tasks.filter(t => t.id !== editingTask?.id).map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>

                {isIndefinite ? null : (editingInstanceDate ? (
                  <div className="p-6 bg-accent-soft border border-accent/20 rounded-2xl">
                    <div className="flex items-center gap-3 mb-2">
                      <Clock size={16} className="text-accent" />
                      <span className="text-[10px] font-black uppercase text-accent tracking-[2px]">{t.editIndividual}</span>
                    </div>
                    <p className="text-[11px] text-text-primary opacity-70 leading-relaxed font-medium">
                      {t.editModeDescription}
                    </p>
                  </div>
                ) : (() => {
                  const parentTask = tasks.find(t => t.id === formParentId);
                  const isParentRecurring = parentTask && parentTask.recurrence.type !== 'none';
                  
                  if (isParentRecurring) {
                    return (
                      <div className="p-6 bg-bg/50 border border-border rounded-2xl">
                        <div className="flex items-center gap-3 mb-2">
                          <Clock size={16} className="text-text-secondary" />
                          <span className="text-[10px] font-black uppercase text-text-secondary tracking-[2px]">{t.recurrenceNone}</span>
                        </div>
                        <p className="text-[11px] text-text-secondary opacity-70 leading-relaxed font-medium">
                          親タスクが繰り返し設定されているため、このタスクは親の設定に従います。
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="border-t border-border pt-6 space-y-6">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-text-secondary tracking-widest mb-4 text-center">{t.recurrenceModel}</label>
                        <div className="flex gap-1 bg-bg p-1 rounded-lg border border-border">
                           {(['none', 'recurring'] as const).map(mode => (
                             <label key={mode} className="flex-1">
                               <input 
                                type="radio" 
                                name="recType" 
                                value={mode} 
                                checked={mode === 'none' ? recType === 'none' : recType !== 'none'}
                                onChange={() => {
                                  if (mode === 'none') setRecType('none');
                                  else if (recType === 'none') setRecType('weekly');
                                }}
                                className="sr-only peer"
                               />
                               <div className="text-center py-2 text-[10px] rounded-md cursor-pointer transition-all uppercase tracking-widest font-black peer-checked:bg-accent peer-checked:text-text-on-accent text-text-secondary hover:text-text-primary">
                                 {mode === 'none' ? t.recurrenceNone : t.recurrenceExists}
                               </div>
                             </label>
                           ))}
                        </div>
                      </div>
                      
                      <div className="min-h-32">
                        <RecurrenceOptions 
                          type={recType} 
                          setType={setRecType}
                          weeklyDays={weeklyDays} 
                          setWeeklyDays={setWeeklyDays}
                          monthlyDays={monthlyDays}
                          setMonthlyDays={setMonthlyDays}
                          interval={interval}
                          setInterval={setIntervalValue}
                          months={months}
                          setMonths={setMonths}
                          holidayAdjustment={holidayAdjustment}
                          setHolidayAdjustment={setHolidayAdjustment}
                        />
                      </div>
                    </div>
                  );
                })())}

                <div className="flex gap-4 pt-4 border-t border-border mt-6">
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
              )}
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
                  if (!holidayDate) return;
                  const formData = new FormData(e.currentTarget);
                  const newHoli: Holiday = {
                    id: generateId(),
                    date: holidayDate,
                    name: formData.get('name') as string
                  };
                  setHolidays([...holidays, newHoli]);
                  setHolidayDate('');
                  e.currentTarget.reset();
                }}
                className="flex flex-col gap-4 mb-8"
              >
                <div className="flex gap-4">
                  <DatePicker 
                    value={holidayDate}
                    onChange={setHolidayDate}
                  />
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
          statusSets={statusSets}
          onSave={setTemplates}
          onClose={() => setIsTemplateManagerOpen(false)}
        />
      )}
    </div>
  );
}
