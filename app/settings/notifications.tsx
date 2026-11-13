import React from 'react';
import { ScrollView } from 'react-native';
import {
  AtSign,
  BellOff,
  CalendarClock,
  Heart,
  KeyRound,
  Mail,
  MessageCircle,
  MessagesSquare,
  UserPlus,
  UsersRound,
} from 'lucide-react-native';
import { ListGroup, ToggleRow } from '@/components/ui';
import { usePreferences, type NotificationKey } from '@/lib/preferences';
import { useColors } from '@/lib/theme';
import type { LucideIcon } from 'lucide-react-native';

type Row = { key: NotificationKey; title: string; subtitle: string; icon: LucideIcon };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Activity',
    rows: [
      { key: 'likes', title: 'Likes', subtitle: 'When someone likes your review', icon: Heart },
      { key: 'comments', title: 'Comments', subtitle: 'Replies on your reviews', icon: MessageCircle },
      { key: 'follows', title: 'New followers', subtitle: 'When someone follows you', icon: UserPlus },
      { key: 'mentions', title: 'Tagged in a review', subtitle: 'When a friend says you were there', icon: AtSign },
    ],
  },
  {
    title: 'Invites & requests',
    rows: [
      { key: 'invites', title: 'Group and hangout invites', subtitle: 'Someone invites you to a group or a private hangout', icon: Mail },
      { key: 'secretRequests', title: 'Secret spot requests', subtitle: 'Someone asks for or offers a trade on your secret spot', icon: KeyRound },
    ],
  },
  {
    title: 'Hangouts',
    rows: [
      { key: 'eventReminders', title: 'Reminders', subtitle: 'Before hangouts you said you are going to', icon: CalendarClock },
      { key: 'eventChats', title: 'Hangout chats', subtitle: 'New messages in hangout group chats', icon: MessagesSquare },
    ],
  },
  {
    title: 'Messages & groups',
    rows: [
      { key: 'directMessages', title: 'Direct messages', subtitle: 'Private messages sent to you', icon: MessageCircle },
      { key: 'groupActivity', title: 'Group activity', subtitle: 'New reviews and hangouts posted to your groups', icon: UsersRound },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const { preferences, setNotification, setNotificationsPaused } = usePreferences();
  const paused = preferences.notificationsPaused;

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <ListGroup footer="Saved on this phone. Push alerts will follow these choices once they're turned on for Third Space.">
        <ToggleRow
          icon={BellOff}
          iconColor={colors.danger}
          title="Pause all"
          subtitle="Mute everything without losing your choices below"
          value={paused}
          onValueChange={setNotificationsPaused}
        />
      </ListGroup>

      {SECTIONS.map((section) => (
        <ListGroup key={section.title} title={section.title}>
          {section.rows.map((row) => (
            <ToggleRow
              key={row.key}
              icon={row.icon}
              title={row.title}
              subtitle={row.subtitle}
              value={!paused && preferences.notifications[row.key]}
              disabled={paused}
              onValueChange={(enabled) => setNotification(row.key, enabled)}
            />
          ))}
        </ListGroup>
      ))}
    </ScrollView>
  );
}
