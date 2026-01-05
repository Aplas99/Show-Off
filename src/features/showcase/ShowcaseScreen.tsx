import { COLORS } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

export default function ShowcaseScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Showcase Screen</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        color: COLORS.white,
    },
});