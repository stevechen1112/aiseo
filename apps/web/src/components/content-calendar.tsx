'use client';

import { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { useContent } from '@/lib/queries';

interface ContentCalendarProps {
  onSelectDate?: (date: string) => void;
  onSelectItem?: (id: string) => void;
}

const statusColors: Record<string, string> = {
  published: '#22c55e',
  draft: '#eab308',
  pending: '#3b82f6',
  pending_review: '#3b82f6',
  approved: '#10b981',
  rejected: '#ef4444',
  scheduled: '#a855f7',
};

export function ContentCalendar({ onSelectDate, onSelectItem }: ContentCalendarProps) {
  // Load a generous amount of content to populate the calendar
  const { data, isLoading } = useContent(1, 200);
  const [currentView] = useState('dayGridMonth');

  const events = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((item) => ({
      id: item.id,
      title: item.title,
      // Use lastModified as event date since we don't have a dedicated scheduled date
      date: item.lastModified?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      backgroundColor: statusColors[item.status] ?? '#6b7280',
      borderColor: statusColors[item.status] ?? '#6b7280',
      extendedProps: {
        status: item.status,
        wordCount: item.wordCount,
        author: item.author,
        targetKeyword: item.targetKeyword,
      },
    }));
  }, [data]);

  const handleEventClick = (info: EventClickArg) => {
    onSelectItem?.(info.event.id);
  };

  const handleDateClick = (info: DateClickArg) => {
    onSelectDate?.(info.dateStr);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        Loading calendar…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="content-calendar">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView={currentView}
          events={events}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek',
          }}
          height="auto"
          eventDisplay="block"
          dayMaxEvents={3}
          eventContent={(arg) => (
            <div className="flex items-center gap-1 px-1 py-0.5 text-xs truncate">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: arg.event.backgroundColor ?? '#6b7280' }}
              />
              <span className="truncate font-medium">{arg.event.title}</span>
            </div>
          )}
        />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-200 dark:border-gray-700 pt-3">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ContentCalendar;
