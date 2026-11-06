import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, type ScrollViewInstance, View } from "react-native";
import { GroupBar } from "@/components/GroupSwitcher";
import { ErrorText, Loading, Text, TextInput, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { useSession } from "@/core/session";
import { chatApi, mergeMessages, type ChatMessage } from "@/modules/chat/api";

const POLL_MS = 4000;

/** The group's chat: newest at the bottom, new messages appear while it's open, long-press your own to delete. */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const owner = state.status === "signedIn" && state.groups.find((g) => g.id === id)?.role === "owner";
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scroll = useRef<ScrollViewInstance>(null);
  const stickToEnd = useRef(true);
  const latest = useRef<string | null>(null);
  latest.current = messages?.at(-1)?.createdAt ?? null;

  const add = useCallback((more: ChatMessage[]) => setMessages((m) => mergeMessages(m ?? [], more)), []);

  // Load the latest page when the screen opens, then poll for new messages while it's in front.
  useFocusEffect(
    useCallback(() => {
      let stop = false;
      chatApi.latest(id).then(
        (p) => {
          if (stop) return;
          add(p.messages);
          setHasMore((h) => (latest.current ? h : p.hasMore));
        },
        (e) => setError(errorText(t, e)),
      );
      const timer = setInterval(() => {
        const since = latest.current;
        (since ? chatApi.after(id, since) : chatApi.latest(id)).then(
          (p) => !stop && p.messages.length && add(p.messages),
          () => {},
        );
      }, POLL_MS);
      return () => {
        stop = true;
        clearInterval(timer);
      };
    }, [id, add, t]),
  );

  useEffect(() => {
    if (stickToEnd.current) setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0);
  }, [messages?.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      add([await chatApi.send(id, body)]);
      setDraft("");
      stickToEnd.current = true;
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSending(false);
    }
  };

  const loadEarlier = async () => {
    const first = messages?.[0];
    if (!first) return;
    try {
      const p = await chatApi.before(id, first.createdAt);
      stickToEnd.current = false;
      add(p.messages);
      setHasMore(p.hasMore);
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  const remove = async (m: ChatMessage) => {
    if (!(await confirm(t("chat.confirmDelete"), t("common.delete"), t("common.cancel")))) return;
    try {
      await chatApi.remove(m.id);
      add([{ ...m, body: "", deleted: true }]);
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, {
      hour: "numeric",
      minute: "2-digit",
    });
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: t("chat.title") }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <GroupBar groupId={id} chat={false} />
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          gap: 6,
          flexGrow: 1,
          justifyContent: "flex-end",
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          stickToEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
        }}
        scrollEventThrottle={100}
      >
        {messages === null && !error ? <Loading /> : null}
        {hasMore && (
          <Pressable accessibilityRole="button" onPress={loadEarlier} style={{ alignSelf: "center", padding: 8 }}>
            <Text style={{ color: c.accent, fontSize: 14 }}>{t("chat.earlier")}</Text>
          </Pressable>
        )}
        {messages?.length === 0 && <Text style={{ color: c.muted, textAlign: "center", fontSize: 15 }}>{t("chat.empty")}</Text>}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || day(prev.createdAt) !== day(m.createdAt);
          const showName = !m.mine && (newDay || prev?.userId !== m.userId);
          return (
            <View key={m.id} style={{ gap: 4 }}>
              {newDay && (
                <Text
                  style={{
                    color: c.muted,
                    fontSize: 12,
                    textAlign: "center",
                    marginVertical: 6,
                  }}
                >
                  {day(m.createdAt)}
                </Text>
              )}
              {showName && <Text style={{ color: c.muted, fontSize: 13, marginLeft: 6 }}>{m.name ?? t("chat.someone")}</Text>}
              <View
                style={{
                  flexDirection: m.mine ? "row-reverse" : "row",
                  alignItems: "flex-end",
                  gap: 6,
                }}
              >
                <Pressable
                  testID="chat-message"
                  disabled={m.deleted || !(m.mine || owner)}
                  onLongPress={() => remove(m)}
                  delayLongPress={400}
                  accessibilityHint={m.mine || owner ? t("chat.deleteHint") : undefined}
                  style={{
                    maxWidth: "78%",
                    backgroundColor: m.mine ? c.pink : c.card,
                    borderColor: c.border,
                    borderWidth: m.mine ? 0 : 1,
                    borderRadius: 18,
                    borderBottomRightRadius: m.mine ? 6 : 18,
                    borderBottomLeftRadius: m.mine ? 18 : 6,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Text
                    selectable
                    style={{
                      color: m.deleted ? c.muted : m.mine ? c.onPink : c.text,
                      fontSize: 16,
                      fontStyle: m.deleted ? "italic" : "normal",
                    }}
                  >
                    {m.deleted ? t("chat.deleted") : m.body}
                  </Text>
                </Pressable>
                <Text style={{ color: c.muted, fontSize: 11 }}>{time(m.createdAt)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <ErrorText>{error}</ErrorText>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
        }}
      >
        <TextInput
          accessibilityLabel={t("chat.placeholder")}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={c.muted}
          multiline
          maxLength={2000}
          onKeyPress={(e) => {
            // Web: Enter sends, Shift+Enter breaks the line.
            const ev = e.nativeEvent as unknown as {
              key: string;
              shiftKey?: boolean;
              isComposing?: boolean;
            };
            if (Platform.OS === "web" && ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
              (e as unknown as { preventDefault: () => void }).preventDefault();
              send();
            }
          }}
          style={{
            flex: 1,
            color: c.text,
            backgroundColor: c.bg,
            borderColor: c.border,
            borderWidth: 1.5,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 16,
            maxHeight: 120,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chat.send")}
          disabled={!draft.trim() || sending}
          onPress={send}
          style={({ pressed }) => ({
            height: 44,
            paddingHorizontal: 18,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.pink,
            opacity: !draft.trim() || sending ? 0.5 : pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: c.onPink, fontSize: 16, fontWeight: "700" }}>{t("chat.send")}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
