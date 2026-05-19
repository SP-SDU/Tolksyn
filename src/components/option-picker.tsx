import { FlatList, Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type OptionPickerItem = {
  id: string;
  label: string;
};

export function OptionPicker({
  title,
  open,
  items,
  selectedId,
  query,
  onQueryChange,
  onClose,
  onSelect,
}: {
  title: string;
  open: boolean;
  items: OptionPickerItem[];
  selectedId?: string | null;
  query?: string;
  onQueryChange?: (value: string) => void;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="max-h-[78%] gap-3 border-4 border-border bg-background p-4" onPress={(event) => event.stopPropagation()}>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-xl font-black uppercase tracking-tight text-foreground">{title}</Text>
            <Button variant="secondary" size="sm" label="Close" onPress={onClose} />
          </View>
          {query != null && onQueryChange ? <Input value={query} placeholder="Search" onChangeText={onQueryChange} /> : null}
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={items}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View className="h-2" />}
            ListEmptyComponent={<Text className="px-1 text-xs font-semibold text-muted">No options available.</Text>}
            renderItem={({ item }) => (
              <Button
                variant={item.id === selectedId ? 'primary' : 'secondary'}
                size="sm"
                className="justify-start px-3"
                textClassName="text-left text-sm"
                label={item.label}
                onPress={() => onSelect(item.id)}
              />
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
