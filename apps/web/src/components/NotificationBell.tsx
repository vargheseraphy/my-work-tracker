/** The bell with an unread count, polled every 60 seconds by the shell (NTF-03). */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDayShort, type NotificationsDto } from '@gtm/shared';
import { api } from '../api.js';
import { Drawer } from './Overlay.jsx';
import { Button, Empty } from './ui.jsx';

export function NotificationBell({ data }: { data: NotificationsDto | undefined }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unread ?? 0;

  return (
    <>
      <button
        type="button"
        className="bell"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? <span className="count">{unread > 99 ? '99+' : unread}</span> : null}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        footer={
          unread > 0 ? (
            <Button
              onClick={() => {
                markAll.mutate();
              }}
            >
              Mark everything read
            </Button>
          ) : undefined
        }
      >
        <div className="stack" style={{ gap: 8 }}>
          {(data?.items.length ?? 0) === 0 ? (
            <Empty>Nothing here yet.</Empty>
          ) : (
            data!.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notif${item.readAt === null ? ' unread' : ''}`}
                onClick={() => {
                  if (item.readAt === null) markRead.mutate(item.id);
                  if (item.link) {
                    setOpen(false);
                    navigate(item.link);
                  }
                }}
              >
                <div className="between">
                  <b className="small">{item.title}</b>
                  <span className="mono xs faint">{formatDayShort(item.localDate)}</span>
                </div>
                <span className="xs muted">{item.body}</span>
              </button>
            ))
          )}
        </div>
      </Drawer>
    </>
  );
}
