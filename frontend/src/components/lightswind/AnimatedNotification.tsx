import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../../lib/cn';

export interface NotificationUser {
    avatarUrl?: string;
    name: string;
    initials?: string;
    color?: string;
}

export interface NotificationItem {
    id: string;
    user: NotificationUser;
    message: string;
    timestamp?: string;
    priority?: 'low' | 'medium' | 'high';
    type?: 'info' | 'success' | 'warning' | 'error';
    fadingOut?: boolean;
}

export interface AnimatedNotificationProps {
    maxNotifications?: number;
    autoInterval?: number;
    autoIntervalRange?: {
        min: number;
        max: number;
    };
    autoGenerate?: boolean;
    notifications?: NotificationItem[];
    customMessages?: string[];
    animationDuration?: number;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    width?: number | string;
    showAvatars?: boolean;
    showTimestamps?: boolean;
    className?: string;
    onNotificationClick?: (notification: NotificationItem) => void;
    onNotificationDismiss?: (notification: NotificationItem) => void;
    allowDismiss?: boolean;
    autoDismissTimeout?: number;
    userApiEndpoint?: string;
    variant?: 'default' | 'minimal' | 'glass' | 'bordered';
    fixedUser?: NotificationUser;
}

const defaultMessages = [
    'Just completed a task! ✅',
    'New feature deployed 🚀',
    'Check out our latest update 📱',
    'Server responded with 200 OK ✨',
    'Background job finished 🔄',
    'Data synced successfully! 💾',
    'User logged in successfully 👋',
    'Payment processed 💳',
    'Email sent successfully 📧',
    'Backup completed 🛡️',
];

const Avatar: React.FC<{ user: NotificationUser; showAvatar: boolean }> = ({ user, showAvatar }) => {
    if (!showAvatar) return null;
    return (
        <div
            className="h-10 w-10 flex-shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center transition-all duration-300 hover:scale-110 backdrop-blur-sm"
            style={{ backgroundColor: user.color }}
        >
            {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={`${user.name} avatar`} className="h-full w-full object-cover" loading="lazy" />
            ) : (
                <span className="text-xs font-bold text-white drop-shadow-sm">
                    {user.initials || user.name.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase()}
                </span>
            )}
        </div>
    );
};

const Notification: React.FC<{
    notification: NotificationItem;
    showAvatars: boolean;
    showTimestamps: boolean;
    variant: string;
    onDismiss?: () => void;
    onClick?: () => void;
    allowDismiss: boolean;
}> = ({ notification, showAvatars, showTimestamps, variant, onDismiss, onClick, allowDismiss }) => {
    const getVariantStyles = () => {
        switch (variant) {
            case 'minimal':
                return 'bg-white/95 border border-border/80 backdrop-blur-xl';
            case 'glass':
                return 'bg-white/55 border border-white/65 backdrop-blur-2xl shadow-2xl';
            case 'bordered':
                return 'bg-white/95 border-2 border-primary/30 backdrop-blur-lg shadow-xl';
            default:
                return 'bg-white/70 border border-white/60 backdrop-blur-2xl shadow-2xl';
        }
    };

    const getPriorityStyles = () => {
        switch (notification.priority) {
            case 'high':
                return 'border-l-4 border-l-red-500 shadow-red-500/20';
            case 'medium':
                return 'border-l-4 border-l-yellow-500 shadow-yellow-500/20';
            case 'low':
                return 'border-l-4 border-l-blue-500 shadow-blue-500/20';
            default:
                return 'border-l-4 border-l-primary/50 shadow-primary/20';
        }
    };

    return (
        <div
            className={cn(
                'group relative transition-all duration-500 ease-out transform hover:scale-[1.02] hover:-translate-y-1',
                'w-full max-w-80 cursor-pointer rounded-xl p-4 flex items-start gap-3',
                getVariantStyles(),
                getPriorityStyles(),
                notification.fadingOut && 'animate-pulse'
            )}
            onClick={onClick}
        >
            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <Avatar user={notification.user} showAvatar={showAvatars} />
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between">
                    <h3 className="truncate text-sm font-semibold text-text-primary">{notification.user.name}</h3>
                    {showTimestamps && notification.timestamp ? (
                        <span className="text-xs font-mono text-bark-500">{notification.timestamp}</span>
                    ) : null}
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">{notification.message}</p>
            </div>

            {allowDismiss ? (
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        onDismiss?.();
                    }}
                    className="h-5 w-5 flex-shrink-0 text-bark-400 transition-all duration-200 hover:text-bark-600 hover:scale-110 opacity-0 group-hover:opacity-100"
                    aria-label="dismiss notification"
                    data-no-magnetic="true"
                >
                    <X className="h-4 w-4" />
                </button>
            ) : null}
        </div>
    );
};

async function fetchRandomUser(apiEndpoint?: string): Promise<NotificationUser> {
    try {
        const endpoint = apiEndpoint || 'https://randomuser.me/api/';
        const response = await fetch(endpoint);
        const data = await response.json();
        const user = data.results[0];
        return {
            avatarUrl: user.picture?.large,
            name: `${user.name.first} ${user.name.last}`,
            color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 80%)`,
        };
    } catch {
        const names = ['John Doe', 'Jane Smith', 'Alex Johnson', 'Sarah Wilson', 'Mike Brown'];
        const randomName = names[Math.floor(Math.random() * names.length)];
        return {
            name: randomName,
            color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 80%)`,
        };
    }
}

function getRandomMessage(customMessages?: string[]) {
    const messages = customMessages || defaultMessages;
    return messages[Math.floor(Math.random() * messages.length)];
}

async function generateNotification(
    customMessages?: string[],
    userApiEndpoint?: string,
    fixedUser?: NotificationUser
): Promise<NotificationItem> {
    const user = fixedUser || (await fetchRandomUser(userApiEndpoint));
    return {
        id: uuidv4(),
        user,
        message: getRandomMessage(customMessages),
        timestamp: new Date().toLocaleTimeString(),
        priority: (['low', 'medium', 'high'] as const)[Math.floor(Math.random() * 3)],
    };
}

export const AnimatedNotification: React.FC<AnimatedNotificationProps> = ({
    maxNotifications = 3,
    autoInterval = 3500,
    autoIntervalRange,
    autoGenerate = true,
    notifications = [],
    customMessages,
    animationDuration = 800,
    position = 'center',
    width = 320,
    showAvatars = true,
    showTimestamps = true,
    className,
    onNotificationClick,
    onNotificationDismiss,
    allowDismiss = true,
    autoDismissTimeout = 3000,
    userApiEndpoint,
    variant = 'glass',
    fixedUser,
}) => {
    const [notes, setNotes] = useState<NotificationItem[]>(notifications);
    const generationTimerRef = useRef<number | null>(null);
    const dismissTimeouts = useRef<Map<string, number>>(new Map());
    const isGenerating = useRef(false);

    const clearNoteTimeout = useCallback((id: string) => {
        const timeoutId = dismissTimeouts.current.get(id);
        if (!timeoutId) return;
        window.clearTimeout(timeoutId);
        dismissTimeouts.current.delete(id);
    }, []);

    const dismissNotification = useCallback(
        (id: string) => {
            setNotes((previous) => {
                const note = previous.find((entry) => entry.id === id);
                if (!note || note.fadingOut) return previous;

                const updated = previous.map((entry) =>
                    entry.id === id ? { ...entry, fadingOut: true } : entry
                );
                clearNoteTimeout(id);

                window.setTimeout(() => {
                    setNotes((current) => {
                        const remaining = current.filter((entry) => entry.id !== id);
                        if (note) onNotificationDismiss?.(note);
                        return remaining;
                    });
                }, animationDuration);

                return updated;
            });
        },
        [animationDuration, clearNoteTimeout, onNotificationDismiss]
    );

    const addGeneratedNote = useCallback(async () => {
        if (!autoGenerate || isGenerating.current) return;
        isGenerating.current = true;
        try {
            const newNote = await generateNotification(customMessages, userApiEndpoint, fixedUser);

            setNotes((previous) => {
                const nonFading = previous.filter((entry) => !entry.fadingOut);
                let next = previous;

                if (nonFading.length >= maxNotifications) {
                    const oldest = nonFading[0];
                    next = previous.map((entry) =>
                        entry.id === oldest.id ? { ...entry, fadingOut: true } : entry
                    );
                    window.setTimeout(() => {
                        setNotes((current) => current.filter((entry) => entry.id !== oldest.id));
                        clearNoteTimeout(oldest.id);
                        onNotificationDismiss?.(oldest);
                    }, animationDuration);
                }

                const appended = [...next, newNote];
                if (autoDismissTimeout > 0) {
                    const timeoutId = window.setTimeout(
                        () => dismissNotification(newNote.id),
                        autoDismissTimeout
                    );
                    dismissTimeouts.current.set(newNote.id, timeoutId);
                }

                return appended;
            });
        } finally {
            isGenerating.current = false;
        }
    }, [
        autoGenerate,
        customMessages,
        userApiEndpoint,
        fixedUser,
        maxNotifications,
        animationDuration,
        clearNoteTimeout,
        onNotificationDismiss,
        autoDismissTimeout,
        dismissNotification,
    ]);

    const getNextInterval = useCallback(() => {
        if (!autoIntervalRange) return autoInterval;
        const min = Math.max(0, Math.min(autoIntervalRange.min, autoIntervalRange.max));
        const max = Math.max(min, Math.max(autoIntervalRange.min, autoIntervalRange.max));
        if (max === min) return min;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }, [autoInterval, autoIntervalRange]);

    useEffect(() => {
        if (!autoGenerate) {
            if (generationTimerRef.current) {
                window.clearTimeout(generationTimerRef.current);
                generationTimerRef.current = null;
            }
            return;
        }

        let active = true;

        const scheduleNext = (delay: number) => {
            generationTimerRef.current = window.setTimeout(async () => {
                if (!active) return;
                await addGeneratedNote();
                if (!active) return;
                scheduleNext(getNextInterval());
            }, delay);
        };

        scheduleNext(getNextInterval());

        return () => {
            active = false;
            if (generationTimerRef.current) {
                window.clearTimeout(generationTimerRef.current);
                generationTimerRef.current = null;
            }
        };
    }, [autoGenerate, addGeneratedNote, getNextInterval]);

    useEffect(() => {
        if (!notifications || notifications.length === 0) return;
        dismissTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
        dismissTimeouts.current.clear();
        setNotes(notifications);
        if (autoDismissTimeout > 0) {
            notifications.forEach((note) => {
                const timeoutId = window.setTimeout(
                    () => dismissNotification(note.id),
                    autoDismissTimeout
                );
                dismissTimeouts.current.set(note.id, timeoutId);
            });
        }
    }, [autoDismissTimeout, dismissNotification, notifications]);

    useEffect(() => {
        const dismissTimeoutMap = dismissTimeouts.current;
        return () => {
            if (generationTimerRef.current) window.clearTimeout(generationTimerRef.current);
            dismissTimeoutMap.forEach((timeoutId) => window.clearTimeout(timeoutId));
            dismissTimeoutMap.clear();
        };
    }, []);

    const handleManualDismiss = useCallback(
        (note: NotificationItem) => {
            clearNoteTimeout(note.id);
            setNotes((previous) =>
                previous.map((entry) =>
                    entry.id === note.id ? { ...entry, fadingOut: true } : entry
                )
            );
            window.setTimeout(() => {
                setNotes((current) => current.filter((entry) => entry.id !== note.id));
                onNotificationDismiss?.(note);
            }, animationDuration);
        },
        [animationDuration, clearNoteTimeout, onNotificationDismiss]
    );

    const getPositionStyles = () => {
        switch (position) {
            case 'top-left':
                return 'fixed top-6 left-6 z-50';
            case 'top-right':
                return 'fixed top-6 right-6 z-50';
            case 'bottom-left':
                return 'fixed bottom-6 left-6 z-50';
            case 'bottom-right':
                return 'fixed bottom-6 right-6 z-50';
            default:
                return 'flex items-center justify-center min-h-auto p-6';
        }
    };

    return (
        <>
            <style
                dangerouslySetInnerHTML={{
                    __html: `
          @keyframes notification-enter {
            from {
              opacity: 0;
              transform: translateY(20px) scale(0.95);
              filter: blur(4px);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
              filter: blur(0px);
            }
          }

          @keyframes notification-exit {
            from {
              opacity: 1;
              transform: translateY(0) scale(1);
              filter: blur(0px);
            }
            to {
              opacity: 0;
              transform: translateY(-20px) scale(0.95);
              filter: blur(4px);
            }
          }

          .notification-enter {
            animation: notification-enter var(--animation-duration) cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }

          .notification-exit {
            animation: notification-exit var(--animation-duration) cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
        `,
                }}
            />

            <div className={cn(getPositionStyles(), className)}>
                <Flipper flipKey={notes.map((note) => note.id).join('')}>
                    <div className="flex flex-col items-center gap-4" style={{ width }}>
                        {notes.map((note) => (
                            <Flipped key={note.id} flipId={note.id}>
                                <div
                                    className={cn(
                                        'notification-item',
                                        note.fadingOut ? 'notification-exit' : 'notification-enter'
                                    )}
                                    style={
                                        {
                                            ['--animation-duration' as string]: `${animationDuration}ms`,
                                        } as React.CSSProperties
                                    }
                                >
                                    <Notification
                                        notification={note}
                                        showAvatars={showAvatars}
                                        showTimestamps={showTimestamps}
                                        variant={variant}
                                        allowDismiss={allowDismiss}
                                        onClick={() => onNotificationClick?.(note)}
                                        onDismiss={() => handleManualDismiss(note)}
                                    />
                                </div>
                            </Flipped>
                        ))}
                    </div>
                </Flipper>
            </div>
        </>
    );
};

export default AnimatedNotification;
