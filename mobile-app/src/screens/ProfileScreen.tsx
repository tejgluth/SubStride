import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Section } from "../components/Section";

export function ProfileScreen() {
  return (
    <View>
      <Section title="Local profile">
        <Text style={styles.copy}>No login is required for the first beta build. Profile data stays local until cloud sync is configured.</Text>
        <TextInput style={styles.input} placeholder="Display name" value="Runner" editable={false} />
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} placeholder="Weekly mileage" value="32 km" editable={false} />
          <TextInput style={[styles.input, styles.half]} placeholder="Weight" value="Optional" editable={false} />
        </View>
      </Section>
      <Section title="Post-run questions">
        <Text style={styles.copy}>Shoe, surface, workout type, and pain 0-10 are stored with each session for baseline filtering and interpretation.</Text>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { fontSize: 14, lineHeight: 20, color: "#4a5565" },
  input: { marginTop: 10, minHeight: 42, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "#cbd3df", paddingHorizontal: 12, color: "#17202c", backgroundColor: "#fbfcfe" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 }
});
