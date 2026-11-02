import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="group/[id]" options={{ title: "그룹" }} />
        <Stack.Screen name="invite/[token]" options={{ title: "그룹 초대" }} />
      </Stack>
    </SessionProvider>
  );
}
