import React from "react";
import { ActivityIndicator, View } from "react-native";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { DutyProvider } from "../context/DutyContext";
import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import OrdersScreen from "../screens/OrdersScreen";
import NewOrderScreen from "../screens/NewOrderScreen";
import VisitsScreen from "../screens/VisitsScreen";
import CatalogScreen from "../screens/CatalogScreen";
import type { RootStackParamList, TabParamList } from "./types";
import { colors } from "../theme";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, [React.ComponentProps<typeof Ionicons>["name"], React.ComponentProps<typeof Ionicons>["name"]]> = {
  Home: ["home", "home-outline"],
  Orders: ["receipt", "receipt-outline"],
  Visits: ["storefront", "storefront-outline"],
  Catalog: ["pricetags", "pricetags-outline"],
};

const headerStyle = {
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { fontWeight: "700" as const, color: colors.text },
  headerShadowVisible: false,
};

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: colors.primary, background: colors.background, card: colors.surface },
};

function Tabs() {
  // Android draws the app edge to edge, so the tab bar must leave room for the
  // system navigation buttons / gesture bar itself.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...headerStyle,
        headerTitleAlign: "center",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={TAB_ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: "My Orders" }} />
      <Tab.Screen name="Visits" component={VisitsScreen} options={{ title: "Shop Visits" }} />
      <Tab.Screen name="Catalog" component={CatalogScreen} options={{ title: "Price List" }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {user ? (
        <DutyProvider>
          <Stack.Navigator screenOptions={headerStyle}>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="NewOrder" component={NewOrderScreen} options={{ title: "New Order" }} />
          </Stack.Navigator>
        </DutyProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
