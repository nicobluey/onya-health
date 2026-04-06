import { useMemo } from 'react';
import { LIVE_ACTIVITY_MESSAGES } from '../liveActivity';
import { AnimatedNotification } from './lightswind/AnimatedNotification';

interface LiveActivityToastProps {
    mobile?: boolean;
}

export function LiveActivityToast({ mobile = false }: LiveActivityToastProps) {
    const configuredMessages = useMemo(
        () => LIVE_ACTIVITY_MESSAGES.map((message) => message.replace(/^Consult update:\s*/i, '')),
        []
    );

    return (
        <AnimatedNotification
            autoGenerate
            customMessages={configuredMessages}
            autoIntervalRange={{ min: 5000, max: 10000 }}
            autoDismissTimeout={mobile ? 2800 : 3200}
            maxNotifications={1}
            position={mobile ? 'bottom-right' : 'bottom-right'}
            width={mobile ? 320 : 360}
            showAvatars={!mobile}
            showTimestamps
            allowDismiss={!mobile}
            variant="glass"
            fixedUser={{
                name: 'Onya Clinical Desk',
                initials: 'OC',
                color: '#58a8ff',
            }}
            className={mobile ? 'bottom-4 right-4 left-4 !fixed !p-0 !items-end !justify-end' : 'bottom-6 right-6 !fixed !p-0 !items-end !justify-end'}
        />
    );
}
