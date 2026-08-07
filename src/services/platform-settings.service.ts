import { prisma } from '../lib/prisma';

export type PlatformSettings = {
  platformFeePercent: number;
  maintenanceMode: boolean;
  allowNewSignups: boolean;
  requireEmailVerification: boolean;
  requirePhoneVerification: boolean;
  autoApproveIndividualSellers: boolean;
  maxListingsPerSeller: number;
  supportEmail: string;
  supportPhone: string;
  language: string;
};

const DEFAULTS: PlatformSettings = {
  platformFeePercent: 5,
  maintenanceMode: false,
  allowNewSignups: true,
  requireEmailVerification: true,
  requirePhoneVerification: false,
  autoApproveIndividualSellers: false,
  maxListingsPerSeller: 50,
  supportEmail: 'support@recorn.market',
  supportPhone: '+250 788 000 000',
  language: 'en',
};

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    platformFeePercent: (map.get('platformFeePercent') as number) ?? DEFAULTS.platformFeePercent,
    maintenanceMode: (map.get('maintenanceMode') as boolean) ?? DEFAULTS.maintenanceMode,
    allowNewSignups: (map.get('allowNewSignups') as boolean) ?? DEFAULTS.allowNewSignups,
    requireEmailVerification: (map.get('requireEmailVerification') as boolean) ?? DEFAULTS.requireEmailVerification,
    requirePhoneVerification: (map.get('requirePhoneVerification') as boolean) ?? DEFAULTS.requirePhoneVerification,
    autoApproveIndividualSellers: (map.get('autoApproveIndividualSellers') as boolean) ?? DEFAULTS.autoApproveIndividualSellers,
    maxListingsPerSeller: (map.get('maxListingsPerSeller') as number) ?? DEFAULTS.maxListingsPerSeller,
    supportEmail: (map.get('supportEmail') as string) ?? DEFAULTS.supportEmail,
    supportPhone: (map.get('supportPhone') as string) ?? DEFAULTS.supportPhone,
    language: (map.get('language') as string) ?? DEFAULTS.language,
  };
}

export async function updateSettings(input: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const updates: { key: string; value: unknown }[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) {
      updates.push({ key: k, value: v });
    }
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.platformSetting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value },
      }),
    ),
  );

  return getSettings();
}
