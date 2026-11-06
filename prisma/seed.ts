import { PrismaClient, GlobalRole, TempleRole, TempleStatus, Weekday } from '../src/generated/prisma/index.js';
import { hashPassword } from '../src/lib/hashing.js';

const prisma = new PrismaClient();

const weekdays: Weekday[] = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
  Weekday.SUN,
];

const dayMap: Record<number, Weekday> = {
  0: Weekday.SUN,
  1: Weekday.MON,
  2: Weekday.TUE,
  3: Weekday.WED,
  4: Weekday.THU,
  5: Weekday.FRI,
  6: Weekday.SAT,
};

async function createSchedulesAndInventory(poojaId: string, templeId: string, startTime: string, endTime: string, capacity: number) {
  const today = new Date();
  for (const day of weekdays) {
    const schedule = await prisma.poojaSchedule.upsert({
      where: {
        poojaId_weekday_startTime: {
          poojaId,
          weekday: day,
          startTime,
        },
      },
      update: { capacity, endTime, isActive: true },
      create: {
        poojaId,
        templeId,
        weekday: day,
        startTime,
        endTime,
        capacity,
        isActive: true,
      },
    });

    for (let i = 0; i < 14; i++) {
      const slotDate = new Date(today);
      slotDate.setDate(today.getDate() + i);

      if (dayMap[slotDate.getDay()] === day) {
        await prisma.slotInventory.upsert({
          where: {
            scheduleId_slotDate: {
              scheduleId: schedule.id,
              slotDate,
            },
          },
          update: { capacity },
          create: {
            scheduleId: schedule.id,
            templeId,
            slotDate,
            capacity,
            booked: 0,
          },
        });
      }
    }
  }
}

async function main() {
  console.log('🌱 Starting comprehensive database seed...');

  // 1. Create Super Admin
  const superAdminPassword = await hashPassword('SuperAdmin#2026!');
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@templeplatform.org' },
    update: {
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: 'admin@templeplatform.org',
      name: 'Platform Super Admin',
      role: GlobalRole.SUPER_ADMIN,
      passwordHash: superAdminPassword,
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      language: 'en',
    },
  });
  console.log('✅ Super Admin created:', superAdmin.email);

  // ------------------------------------------------------------------------
  // Temple 1: Guruvayur Sree Krishna Temple (Thrissur)
  // ------------------------------------------------------------------------
  const guruvayur = await prisma.temple.upsert({
    where: { slug: 'guruvayur-sree-krishna' },
    update: { status: TempleStatus.ACTIVE },
    create: {
      slug: 'guruvayur-sree-krishna',
      name: 'Guruvayur Sree Krishna Temple',
      nameMl: 'ഗുരുവായൂർ ശ്രീകൃഷ്ണ ക്ഷേത്രം',
      deity: 'Lord Krishna',
      description: 'Historical and revered Hindu temple dedicated to Lord Guruvayurappan located in Guruvayur, Kerala.',
      descriptionMl: 'ഗുരുവായൂരിലെ പ്രസിദ്ധമായ ശ്രീകൃഷ്ണ ക്ഷേത്രം.',
      addressLine: 'Guruvayur, Thrissur District',
      district: 'Thrissur',
      state: 'Kerala',
      pincode: '680101',
      latitude: 10.5946,
      longitude: 76.0402,
      phone: '+91 487 2556335',
      email: 'office@guruvayurdevaswom.in',
      coverImageUrl: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=1200&q=80',
      status: TempleStatus.ACTIVE,
      bookingAdvanceDays: 60,
      cancellationCutoffHours: 24,
      openingHours: { morning: '03:00 - 13:30', evening: '16:30 - 21:15' },
    },
  });

  const adminPassword = await hashPassword('TempleAdmin#2026!');
  const guruvayurAdmin = await prisma.user.upsert({
    where: { email: 'admin@guruvayur.org' },
    update: {
      passwordHash: adminPassword,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: 'admin@guruvayur.org',
      name: 'Guruvayur Temple Manager',
      role: GlobalRole.DEVOTEE,
      passwordHash: adminPassword,
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.templeStaff.upsert({
    where: { userId_templeId: { userId: guruvayurAdmin.id, templeId: guruvayur.id } },
    update: { role: TempleRole.ADMIN },
    create: { userId: guruvayurAdmin.id, templeId: guruvayur.id, role: TempleRole.ADMIN, isActive: true },
  });

  const staffPassword = await hashPassword('TempleStaff#2026!');
  const guruvayurStaff = await prisma.user.upsert({
    where: { email: 'staff@guruvayur.org' },
    update: {
      passwordHash: staffPassword,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: 'staff@guruvayur.org',
      name: 'Counter Staff Raman',
      role: GlobalRole.DEVOTEE,
      passwordHash: staffPassword,
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.templeStaff.upsert({
    where: { userId_templeId: { userId: guruvayurStaff.id, templeId: guruvayur.id } },
    update: { role: TempleRole.STAFF },
    create: { userId: guruvayurStaff.id, templeId: guruvayur.id, role: TempleRole.STAFF, isActive: true },
  });

  const palpayasam = await prisma.pooja.create({
    data: {
      templeId: guruvayur.id,
      name: 'Palpayasam Nivedyam',
      nameMl: 'പാൽപ്പായസം നിവേദ്യം',
      description: 'Special sweet milk kheer offering for Lord Guruvayurappan.',
      pricePaise: 10000,
      durationMinutes: 30,
      maxDevoteesPerBooking: 4,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(palpayasam.id, guruvayur.id, '08:30', '09:00', 50);

  const vakacharthu = await prisma.pooja.create({
    data: {
      templeId: guruvayur.id,
      name: 'Vakacharthu & Oil Abhishekam',
      nameMl: 'വാകച്ചാർത്ത് & എണ്ണ അഭിഷേകം',
      description: 'Auspicious early morning herbal cleansing darshanam.',
      pricePaise: 25000,
      durationMinutes: 45,
      maxDevoteesPerBooking: 2,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(vakacharthu.id, guruvayur.id, '03:30', '04:15', 30);

  const ekadasi = await prisma.occasion.create({
    data: {
      templeId: guruvayur.id,
      name: 'Guruvayur Ekadasi Festival',
      nameMl: 'ഗുരുവായൂർ ഏകാദശി',
      description: 'Major annual festival with illuminated Vilakku processions and special feast.',
      startDate: new Date('2026-11-20'),
      endDate: new Date('2026-11-25'),
      startTime: '05:00',
      isRecurringYearly: true,
      isPublished: true,
    },
  });
  await prisma.occasionPooja.create({ data: { occasionId: ekadasi.id, poojaId: palpayasam.id } });

  await prisma.announcement.create({
    data: {
      templeId: guruvayur.id,
      title: 'Guruvayur Ekadasi Advance Booking Open',
      body: 'Devotees can now reserve special Palpayasam nivedyam for Ekadasi festival days. Please arrive 30 minutes early.',
      createdById: guruvayurAdmin.id,
      sendPush: false,
    },
  });

  // ------------------------------------------------------------------------
  // Temple 2: Chottanikkara Bhagavathy Temple (Ernakulam)
  // ------------------------------------------------------------------------
  const chottanikkara = await prisma.temple.upsert({
    where: { slug: 'chottanikkara-bhagavathy' },
    update: { status: TempleStatus.ACTIVE },
    create: {
      slug: 'chottanikkara-bhagavathy',
      name: 'Chottanikkara Bhagavathy Temple',
      nameMl: 'ചോറ്റാനിക്കര ഭഗവതി ക്ഷേത്രം',
      deity: 'Goddess Rajarajeswari',
      description: 'Renowned shrine worshipped in three forms: Saraswathi in the morning, Lakshmi at noon, and Durga in the evening.',
      descriptionMl: 'മനോരോഗ ശാന്തിക്ക് പ്രസിദ്ധമായ ആദിപരാശക്തി ക്ഷേത്രം.',
      addressLine: 'Chottanikkara, Ernakulam District',
      district: 'Ernakulam',
      state: 'Kerala',
      pincode: '682312',
      latitude: 9.9328,
      longitude: 76.3925,
      phone: '+91 484 2711032',
      email: 'contact@chottanikkarabhagavathy.org',
      coverImageUrl: 'https://images.unsplash.com/photo-1609766857041-ed402ea8069a?auto=format&fit=crop&w=1200&q=80',
      status: TempleStatus.ACTIVE,
      bookingAdvanceDays: 45,
      cancellationCutoffHours: 12,
      openingHours: { morning: '04:00 - 12:00', evening: '16:00 - 20:30' },
    },
  });

  const guruthiPooja = await prisma.pooja.create({
    data: {
      templeId: chottanikkara.id,
      name: 'Kizhukkavu Valiya Guruthi Pooja',
      nameMl: 'കീഴ്‍ക്കാവ് വലിയ ഗുരുതി പൂജ',
      description: 'Famous nocturnal crimson offering to ward off negative energies and bring spiritual peace.',
      pricePaise: 35000,
      durationMinutes: 40,
      maxDevoteesPerBooking: 5,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(guruthiPooja.id, chottanikkara.id, '20:00', '20:45', 40);

  const chottanikkaraArchana = await prisma.pooja.create({
    data: {
      templeId: chottanikkara.id,
      name: 'Rajarajeswari Pushpanjali',
      nameMl: 'രാജരാജേശ്വരി പുഷ്പാഞ്ജലി',
      description: 'Sacred floral offering invoking wealth, knowledge, and health.',
      pricePaise: 5000,
      durationMinutes: 20,
      maxDevoteesPerBooking: 3,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(chottanikkaraArchana.id, chottanikkara.id, '09:00', '09:30', 80);

  const makamThozhal = await prisma.occasion.create({
    data: {
      templeId: chottanikkara.id,
      name: 'Chottanikkara Makam Thozhal',
      nameMl: 'ചോറ്റാനിക്കര മകം തൊഴൽ',
      description: 'The golden darshanam of Goddess Bhagavathy in full bridal splendour.',
      startDate: new Date('2026-11-28'),
      endDate: new Date('2026-12-02'),
      startTime: '14:00',
      isRecurringYearly: true,
      isPublished: true,
    },
  });
  await prisma.occasionPooja.create({ data: { occasionId: makamThozhal.id, poojaId: chottanikkaraArchana.id } });

  await prisma.announcement.create({
    data: {
      templeId: chottanikkara.id,
      title: 'Makam Thozhal Darshan Guidelines',
      body: 'Queue passes for Makam Thozhal will be verified via QR code scan at the western entrance.',
      createdById: guruvayurAdmin.id,
      sendPush: false,
    },
  });

  // ------------------------------------------------------------------------
  // Temple 3: Attukal Bhagavathy Temple (Thiruvananthapuram)
  // ------------------------------------------------------------------------
  const attukal = await prisma.temple.upsert({
    where: { slug: 'attukal-bhagavathy' },
    update: { status: TempleStatus.ACTIVE },
    create: {
      slug: 'attukal-bhagavathy',
      name: 'Attukal Bhagavathy Temple',
      nameMl: 'ആറ്റുകാൽ ഭഗവതി ക്ഷേത്രം',
      deity: 'Goddess Kannaki',
      description: 'Known as the Sabarimala of Women, holding the Guinness World Record for the largest congregation of women.',
      descriptionMl: 'സ്ത്രീകളുടെ ശബരിമല എന്നറിയപ്പെടുന്ന ആറ്റുകാൽ ദേവി ക്ഷേത്രം.',
      addressLine: 'Attukal, Manacaud',
      district: 'Thiruvananthapuram',
      state: 'Kerala',
      pincode: '695009',
      latitude: 8.4716,
      longitude: 76.9536,
      phone: '+91 471 2463130',
      email: 'trust@attukal.org',
      coverImageUrl: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1200&q=80',
      status: TempleStatus.ACTIVE,
      bookingAdvanceDays: 60,
      cancellationCutoffHours: 24,
      openingHours: { morning: '04:30 - 12:30', evening: '17:00 - 21:00' },
    },
  });

  const pongalaSeva = await prisma.pooja.create({
    data: {
      templeId: attukal.id,
      name: 'Pongala Nivedyam Seva',
      nameMl: 'പൊങ്കാല നിവേദ്യം സേവ',
      description: 'Special sweet rice and jaggery preparation offered to the Divine Mother.',
      pricePaise: 15000,
      durationMinutes: 60,
      maxDevoteesPerBooking: 4,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(pongalaSeva.id, attukal.id, '10:00', '11:00', 60);

  const chuttuvilakku = await prisma.pooja.create({
    data: {
      templeId: attukal.id,
      name: 'Chuttuvilakku & Niramala',
      nameMl: 'ചുറ്റുവിളക്ക് & നിറമാല',
      description: 'Illumination of thousands of oil lamps surrounding the inner sanctum.',
      pricePaise: 50000,
      durationMinutes: 45,
      maxDevoteesPerBooking: 6,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(chuttuvilakku.id, attukal.id, '18:30', '19:15', 25);

  const attukalPongala = await prisma.occasion.create({
    data: {
      templeId: attukal.id,
      name: 'Attukal Pongala Mahotsavam',
      nameMl: 'ആറ്റുകാൽ പൊങ്കാല മഹോത്സവം',
      description: 'The world-famous 10-day celebration culminating in the historic Pongala hearth lighting.',
      startDate: new Date('2026-12-05'),
      endDate: new Date('2026-12-14'),
      startTime: '06:00',
      isRecurringYearly: true,
      isPublished: true,
    },
  });
  await prisma.occasionPooja.create({ data: { occasionId: attukalPongala.id, poojaId: pongalaSeva.id } });

  // ------------------------------------------------------------------------
  // Temple 4: Ettumanoor Mahadeva Temple (Kottayam)
  // ------------------------------------------------------------------------
  const ettumanoor = await prisma.temple.upsert({
    where: { slug: 'ettumanoor-mahadeva' },
    update: { status: TempleStatus.ACTIVE },
    create: {
      slug: 'ettumanoor-mahadeva',
      name: 'Ettumanoor Mahadeva Temple',
      nameMl: 'ഏറ്റുമാനൂർ മഹാദേവക്ഷേത്രം',
      deity: 'Lord Shiva',
      description: 'Ancient Shiva temple famous for its 16th-century wood carvings, mural paintings, and Ezharaponnana.',
      descriptionMl: 'ഏഴരപ്പൊന്നാന എഴുന്നള്ളത്തിന് പ്രശസ്തമായ ശിവക്ഷേത്രം.',
      addressLine: 'Temple Road, Ettumanoor',
      district: 'Kottayam',
      state: 'Kerala',
      pincode: '686631',
      latitude: 9.6705,
      longitude: 76.5645,
      phone: '+91 481 2535670',
      email: 'devaswom@ettumanoortemple.com',
      coverImageUrl: 'https://images.unsplash.com/photo-1590076215667-875d4ef2d7ee?auto=format&fit=crop&w=1200&q=80',
      status: TempleStatus.ACTIVE,
      bookingAdvanceDays: 30,
      cancellationCutoffHours: 24,
      openingHours: { morning: '04:00 - 12:00', evening: '17:00 - 20:30' },
    },
  });

  const rudrabhishekam = await prisma.pooja.create({
    data: {
      templeId: ettumanoor.id,
      name: 'Maha Rudrabhishekam',
      nameMl: 'മഹാ രുദ്രാഭിഷേകം',
      description: 'Sacred Vedic chanting abhishekam using tender coconut water, milk, and holy ash.',
      pricePaise: 20000,
      durationMinutes: 45,
      maxDevoteesPerBooking: 3,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(rudrabhishekam.id, ettumanoor.id, '07:30', '08:15', 35);

  const dhara = await prisma.pooja.create({
    data: {
      templeId: ettumanoor.id,
      name: 'Jala Dhara Seva',
      nameMl: 'ജലധാര',
      description: 'Continuous offering of cold fragrant holy water over the Shiva Linga.',
      pricePaise: 7500,
      durationMinutes: 30,
      maxDevoteesPerBooking: 2,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(dhara.id, ettumanoor.id, '08:45', '09:15', 50);

  // ------------------------------------------------------------------------
  // Temple 5: Tali Maha Shiva Temple (Kozhikode)
  // ------------------------------------------------------------------------
  const tali = await prisma.temple.upsert({
    where: { slug: 'tali-maha-shiva' },
    update: { status: TempleStatus.ACTIVE },
    create: {
      slug: 'tali-maha-shiva',
      name: 'Tali Maha Shiva Temple',
      nameMl: 'തളി മഹാശിവക്ഷേത്രം',
      deity: 'Lord Shiva',
      description: 'Historical sanctuary established by the Zamorins of Calicut, seat of the ancient Revathi Pattathanam scholastic assembly.',
      descriptionMl: 'സാമൂതിരി രാജവംശത്തിന്റെ പ്രസിദ്ധമായ തളി ക്ഷേത്രം.',
      addressLine: 'Tali, Chalappuram',
      district: 'Kozhikode',
      state: 'Kerala',
      pincode: '673002',
      latitude: 11.2464,
      longitude: 75.7865,
      phone: '+91 495 2703610',
      email: 'info@talitemple.org',
      coverImageUrl: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=80',
      status: TempleStatus.ACTIVE,
      bookingAdvanceDays: 30,
      cancellationCutoffHours: 24,
      openingHours: { morning: '04:30 - 11:30', evening: '17:00 - 20:30' },
    },
  });

  const mrityunjaya = await prisma.pooja.create({
    data: {
      templeId: tali.id,
      name: 'Mrityunjaya Homam',
      nameMl: 'മൃത്യുഞ്ജയ ഹോമം',
      description: 'Powerful fire ritual invoking Lord Shiva for longevity, recovery from illness, and vitality.',
      pricePaise: 40000,
      durationMinutes: 60,
      maxDevoteesPerBooking: 4,
      requiresBooking: true,
      isActive: true,
    },
  });
  await createSchedulesAndInventory(mrityunjaya.id, tali.id, '06:30', '07:30', 20);

  console.log('✅ Seed completed successfully with 5 rich temples, poojas, daily schedules, occasions & announcements! 🎉');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
