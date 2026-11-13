import React, { useCallback, useState } from 'react';
import { AppState, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { Camera, Globe, ImageIcon, KeyRound, Lock, MapPin, MapPinCheck, UsersRound } from 'lucide-react-native';
import { ListGroup, ListRow } from '@/components/ui';
import { useColors } from '@/lib/theme';

type Status = 'granted' | 'denied' | 'undetermined' | 'limited';

const STATUS_LABELS: Record<Status, string> = {
  granted: 'Allowed',
  limited: 'Limited',
  denied: 'Off',
  undetermined: 'Not asked yet',
};

export default function PrivacySettingsScreen() {
  const colors = useColors();
  const [location, setLocation] = useState<Status>('undetermined');
  const [photos, setPhotos] = useState<Status>('undetermined');
  const [camera, setCamera] = useState<Status>('undetermined');

  const refresh = useCallback(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => setLocation(status as Status)).catch(() => undefined);
    ImagePicker.getMediaLibraryPermissionsAsync()
      .then((result) => setPhotos(result.accessPrivileges === 'limited' ? 'limited' : result.status as Status))
      .catch(() => undefined);
    ImagePicker.getCameraPermissionsAsync().then(({ status }) => setCamera(status as Status)).catch(() => undefined);
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]));

  const openSettings = () => Linking.openSettings();

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <ListGroup title="Phone permissions" footer="Change these in your phone's Settings app.">
        <ListRow icon={MapPin} title="Location" subtitle="Centers the map and calendar on you" value={STATUS_LABELS[location]} onPress={openSettings} />
        <ListRow icon={ImageIcon} title="Photos" subtitle="Add pictures to reviews and your profile" value={STATUS_LABELS[photos]} onPress={openSettings} />
        <ListRow icon={Camera} title="Camera" subtitle="Take pictures for reviews and your profile" value={STATUS_LABELS[camera]} onPress={openSettings} />
      </ListGroup>

      <ListGroup title="Who sees what">
        <ListRow icon={Globe} title="Reviews and ratings" subtitle="Anyone on Third Space. Followers also see them in their Following feed." />
        <ListRow icon={KeyRound} iconColor={colors.secret} title="Secret spots" subtitle="Only the name and exact location stay hidden until you let someone in or accept a trade." />
        <ListRow icon={Lock} title="Private hangouts" subtitle="Only people with the invite link or an in-app invite." />
        <ListRow icon={UsersRound} title="Private groups" subtitle="Only members. A group's feed shows reviews where you tagged that group." />
        <ListRow icon={MapPinCheck} title="I'm here check-ins" subtitle="People who can see the hangout see who checked in. The here-chat deletes when it ends." />
      </ListGroup>
    </ScrollView>
  );
}
