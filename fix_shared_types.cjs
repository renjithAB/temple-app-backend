const fs = require('fs');
const path = require('path');

const mobileDir = 'c:/Users/Solvify/Desktop/tms/mobile';

// 1. Update colors.ts to include developer convenience aliases
const colorsFile = path.join(mobileDir, 'src/theme/colors.ts');
let colorsContent = fs.readFileSync(colorsFile, 'utf8');

// Replace lightColors and darkColors definitions with aliases
const updatedColors = `export const palette = {
  saffron: '#E65100',
  saffronLight: '#FF833A',
  saffronDark: '#AC1900',
  saffronSurface: '#FFF3E0',

  gold: '#FFB300',
  goldLight: '#FFE54C',
  goldDark: '#C68400',
  goldSurface: '#FFF8E1',

  maroon: '#880E4F',
  maroonLight: '#BC477B',
  maroonDark: '#560027',

  emerald: '#2E7D32',
  emeraldLight: '#60AD5E',
  emeraldSurface: '#E8F5E9',

  coral: '#C62828',
  coralLight: '#FF5F52',
  coralSurface: '#FFEBEE',

  amber: '#EF6C00',
  amberSurface: '#FFF3E0',

  teal: '#00796B',
  tealSurface: '#E0F2F1',

  neutral: {
    white: '#FFFFFF',
    black: '#000000',
    grey50: '#FAFAFA',
    grey100: '#F5F5F5',
    grey200: '#EEEEEE',
    grey300: '#E0E0E0',
    grey400: '#BDBDBD',
    grey500: '#9E9E9E',
    grey600: '#757575',
    grey700: '#616161',
    grey800: '#424242',
    grey900: '#212121',
  },
};

export const lightColors = {
  primary: palette.saffron,
  primaryLight: palette.saffronLight,
  primaryDark: palette.saffronDark,
  primarySurface: palette.saffronSurface,

  secondary: palette.gold,
  secondaryLight: palette.goldLight,
  secondaryDark: palette.goldDark,
  secondarySurface: palette.goldSurface,

  accent: palette.maroon,

  background: '#FAF6F0',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceVariant: '#F3ECE2',

  text: '#1F1A16',
  textPrimary: '#1F1A16',
  textSecondary: '#6B6055',
  textTertiary: '#9E9284',
  textInverse: '#FFFFFF',
  white: '#FFFFFF',

  border: '#E8DFD3',
  borderFocus: palette.saffron,

  success: palette.emerald,
  successSurface: palette.emeraldSurface,
  error: palette.coral,
  danger: palette.coral,
  errorSurface: palette.coralSurface,
  warning: palette.amber,
  warningSurface: palette.amberSurface,
  info: palette.teal,
  infoSurface: palette.tealSurface,

  badgeConfirmed: palette.emerald,
  badgeCompleted: palette.teal,
  badgeCancelled: palette.coral,
  badgeNoShow: palette.neutral.grey600,
};

export const darkColors: typeof lightColors = {
  primary: '#FF7D3B',
  primaryLight: '#FFA06D',
  primaryDark: '#D84300',
  primarySurface: '#2D1606',

  secondary: '#FFC107',
  secondaryLight: '#FFE082',
  secondaryDark: '#FFA000',
  secondarySurface: '#2D2305',

  accent: '#D81B60',

  background: '#12100E',
  surface: '#1E1A17',
  card: '#1E1A17',
  surfaceElevated: '#2A2420',
  surfaceVariant: '#352E28',

  text: '#FDFBF7',
  textPrimary: '#FDFBF7',
  textSecondary: '#C7BEB3',
  textTertiary: '#8D8275',
  textInverse: '#12100E',
  white: '#FFFFFF',

  border: '#3D342C',
  borderFocus: '#FF7D3B',

  success: '#4CAF50',
  successSurface: '#0E2811',
  error: '#EF5350',
  danger: '#EF5350',
  errorSurface: '#2C0D0E',
  warning: '#FFA726',
  warningSurface: '#2D1B05',
  info: '#26A69A',
  infoSurface: '#052320',

  badgeConfirmed: '#4CAF50',
  badgeCompleted: '#26A69A',
  badgeCancelled: '#EF5350',
  badgeNoShow: '#9E9E9E',
};

export type ThemeColors = typeof lightColors;
`;

fs.writeFileSync(colorsFile, updatedColors);

// 2. Update Header.tsx to flexibly accept both ReactNode or { icon, onPress } for rightAction
const headerFile = path.join(mobileDir, 'src/components/Header.tsx');
const headerContent = `import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

interface HeaderActionObj {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode | HeaderActionObj;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
}) => {
  const { colors } = useTheme();

  const renderRightAction = () => {
    if (!rightAction) return null;
    if (React.isValidElement(rightAction)) {
      return rightAction;
    }
    const actionObj = rightAction as HeaderActionObj;
    if (actionObj.icon && actionObj.onPress) {
      return (
        <TouchableOpacity onPress={actionObj.onPress} style={styles.actionBtn}>
          <Ionicons name={actionObj.icon} size={24} color={colors.primary} />
        </TouchableOpacity>
      );
    }
    return null;
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}
    >
      <View style={styles.row}>
        {showBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.rightAction}>{renderRightAction()}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rightAction: {
    marginLeft: 8,
  },
  actionBtn: {
    padding: 6,
  },
});
`;
fs.writeFileSync(headerFile, headerContent);

// 3. Update EmptyState.tsx to accept actionLabel alias
const emptyStateFile = path.join(mobileDir, 'src/components/EmptyState.tsx');
const emptyStateContent = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Button } from './Button';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionTitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'information-circle-outline',
  title,
  description,
  actionTitle,
  actionLabel,
  onAction,
}) => {
  const { colors } = useTheme();
  const label = actionTitle || actionLabel;

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceVariant }]}>
        <Ionicons name={icon} size={42} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
      )}
      {label && onAction && (
        <Button
          title={label}
          onPress={onAction}
          style={styles.button}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginVertical: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  button: {
    minWidth: 160,
  },
});
`;
fs.writeFileSync(emptyStateFile, emptyStateContent);

// 4. Update api/index.ts to export superAdminApi, templeApi, poojaApi, occasionApi, staffApi, adminApi, bookingApi
const apiIndexFile = path.join(mobileDir, 'src/api/index.ts');
let apiIndex = fs.readFileSync(apiIndexFile, 'utf8');

if (!apiIndex.includes('export const superAdminApi')) {
  apiIndex += `
// Exported SDK shortcuts for admin/super/staff screens
export const templeApi = {
  getById: (id: string) => api.temples.get(id).then(res => ({ temple: res })),
  getAnnouncements: (id: string) => api.announcements.listForTemple(id).then(res => ({ announcements: res })),
};

export const poojaApi = {
  listByTemple: (id: string) => api.poojas.listForTemple(id).then(res => ({ poojas: res })),
  getSlots: (poojaId: string, date: string) => api.poojas.getAvailability(poojaId, date, date),
  create: (templeId: string, data: any) => api.staffPortal.createPooja(templeId, data),
};

export const occasionApi = {
  listByTemple: (templeId: string) => api.occasions.listForTemple(templeId).then(res => ({ occasions: res })),
};

export const staffApi = api.staffPortal;
export const adminApi = {
  createSlot: (poojaId: string, data: any) => api.staffPortal.createSchedule(data.templeId || '', poojaId, data),
  createOccasion: (templeId: string, data: any) => api.staffPortal.createOccasion(templeId, data),
  createAnnouncement: (templeId: string, data: any) => api.staffPortal.createAnnouncement(templeId, data),
  listStaff: (templeId: string) => api.staffPortal.listStaff(templeId).then(res => ({ staff: res })),
  assignStaff: (templeId: string, data: any) => api.staffPortal.assignStaff(templeId, data),
};

export const superAdminApi = {
  getDashboardStats: () => api.superAdmin.getPlatformSummary().then(res => ({ stats: res })),
  listAllTemples: () => api.superAdmin.listTemples().then(res => ({ temples: res.data })),
  createTemple: (data: any) => api.superAdmin.createTemple(data),
  updateTempleStatus: (templeId: string, status: any) => api.superAdmin.updateTempleStatus(templeId, status),
  listUsers: (q?: string) => api.superAdmin.listUsers(q).then(res => ({ users: res.data })),
};

export const bookingApi = api.bookings;
`;
  fs.writeFileSync(apiIndexFile, apiIndex);
}

// 5. Update models.ts to ensure User has isActive and Temple has primaryDeity alias
const modelsFile = path.join(mobileDir, 'src/types/models.ts');
let modelsContent = fs.readFileSync(modelsFile, 'utf8');
if (!modelsContent.includes('primaryDeity?:')) {
  modelsContent = modelsContent.replace('deity: string;', 'deity: string;\n  primaryDeity?: string;');
}
if (!modelsContent.includes('isActive?: boolean;')) {
  modelsContent = modelsContent.replace('role: GlobalRole;', 'role: GlobalRole;\n  isActive?: boolean;');
}
fs.writeFileSync(modelsFile, modelsContent);

console.log('Shared types and utilities synchronized successfully!');
