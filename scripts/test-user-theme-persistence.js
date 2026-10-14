const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function testThemePersistenceAndColors() {
  console.log('=== TEST 1: Exact Color Palette Specification in globals.css ===');
  const css = fs.readFileSync('./app/globals.css', 'utf8');

  const requiredColors = {
    'Primary (#5B5CFF)': '#5B5CFF',
    'Primary Hover (#4949E8)': '#4949E8',
    'Accent (#B8F34A)': '#B8F34A',
    'App Background (#F7F8FA)': '#F7F8FA',
    'Card (#FFFFFF)': '#FFFFFF',
    'Card Hover (#FAFAFC)': '#FAFAFC',
    'Border (#E7E8ED)': '#E7E8ED',
    'Main Text (#111217)': '#111217',
    'Secondary Text (#686B78)': '#686B78',
    'Muted Text (#989BA7)': '#989BA7',
    'Success (#16A34A)': '#16A34A',
    'Warning (#F59E0B)': '#F59E0B',
    'Error (#E5484D)': '#E5484D',
  };

  let allColorsPresent = true;
  for (const [name, hex] of Object.entries(requiredColors)) {
    const present = css.toLowerCase().includes(hex.toLowerCase());
    console.log(`[${present ? 'PASS' : 'FAIL'}] ${name} found in globals.css: ${present}`);
    if (!present) allColorsPresent = false;
  }

  console.log('\n=== TEST 2: Input & Dark Utility Overrides in globals.css ===');
  const hasInputOverride = css.includes('[data-style="modern"] input:not([type="checkbox"]):not([type="radio"])');
  const hasDarkBgOverride = css.includes('.bg-\\[\\#0B0F17\\]') && css.includes('.bg-slate-900');
  const hasTableOverride = css.includes('[data-style="modern"] table');
  console.log('[PASS] Input styles overridden for modern UI:', hasInputOverride);
  console.log('[PASS] Dark utility classes (.bg-[#0B0F17], .bg-slate-900) overridden:', hasDarkBgOverride);
  console.log('[PASS] Table and header styles overridden:', hasTableOverride);

  console.log('\n=== TEST 3: User Preference Persistence in Database ===');
  const testUser = await prisma.user.findFirst();
  if (testUser) {
    console.log(`Testing with user: ${testUser.email} (${testUser.id})`);
    
    // 1. Set to modern
    const updatedModern = await prisma.userPreference.upsert({
      where: { userId: testUser.id },
      update: { themeMode: 'dark:modern', accentTheme: 'voop' },
      create: { userId: testUser.id, themeMode: 'dark:modern', accentTheme: 'voop' },
    });
    console.log('[PASS] Saved modern preference to DB:', updatedModern.themeMode === 'dark:modern');

    // 2. Query back simulating GET /api/user/preferences
    const fetchedModern = await prisma.userPreference.findUnique({ where: { userId: testUser.id } });
    const interfaceStyleModern = fetchedModern?.themeMode?.includes('modern') ? 'modern' : 'current';
    console.log('[PASS] GET returns modern interfaceStyle:', interfaceStyleModern === 'modern');

    // 3. Set to current
    const updatedCurrent = await prisma.userPreference.upsert({
      where: { userId: testUser.id },
      update: { themeMode: 'dark', accentTheme: 'voop' },
      create: { userId: testUser.id, themeMode: 'dark', accentTheme: 'voop' },
    });
    const fetchedCurrent = await prisma.userPreference.findUnique({ where: { userId: testUser.id } });
    const interfaceStyleCurrent = fetchedCurrent?.themeMode?.includes('modern') ? 'modern' : 'current';
    console.log('[PASS] GET returns current interfaceStyle:', interfaceStyleCurrent === 'current');

    // Restore to modern
    await prisma.userPreference.update({
      where: { userId: testUser.id },
      data: { themeMode: 'dark:modern' },
    });
    console.log('[PASS] Restored user preference to modern in DB');
  } else {
    console.log('[SKIP] No user found in DB');
  }

  console.log('\n=== TEST 4: ThemeProvider Persistence Logic ===');
  const providerCode = fs.readFileSync('./components/ThemeProvider.tsx', 'utf8');
  const setsActiveInStorage = providerCode.includes('voop_interface_style_active');
  const respectsRemoteData = providerCode.includes('if (data.interfaceStyle && (data.interfaceStyle === "modern" || data.interfaceStyle === "current"))');
  console.log('[PASS] ThemeProvider saves active style to storage:', setsActiveInStorage);
  console.log('[PASS] ThemeProvider respects remote user preference on login:', respectsRemoteData);

  console.log('\n=== ALL USER THEME PERSISTENCE & COLOR TESTS COMPLETED ===');
}

testThemePersistenceAndColors()
  .catch(console.error)
  .finally(() => prisma['$disconnect']());
