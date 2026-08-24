// config.js
// Fill in your real values below. Nothing here works until you do.

module.exports = {
  mettax: {
    baseUrl: 'https://mettahub.mettaxiot.com/gps',
    apiKey: 'Th2PG5Ec4Q',
    apiSecret: 'vgg1ptScdw8IHJpC7yGK',
  },

  google: {
    // TODO: needed for Motion Offline Alert's address lookup (Geocoding API)
    geocodingApiKey: '***REMOVED-GOOGLE-API-KEY***',
  },

  // TODO: WhatsApp group JIDs. Find yours by messaging the group once with
  // your account, then logging msg.key.remoteJid in app.js's messages.upsert
  // handler — group JIDs look like "1234567890-1234567890@g.us".
  whatsappGroups: {
    dailyAlert: '120363410855926684@g.us', // LS Stuff
    communicationLost: '120363410855926684@g.us', // LS Stuff
    berkatSatuHourly: '120363410855926684@g.us', // LS Stuff
    motionOfflineAlert: '120363410855926684@g.us', // LS Stuff
  },

  // Customer name(s)/device ID(s) excluded from ALL alerts (Daily Alert,
  // Communication Lost, Berkat Satu Hourly, Motion Offline Alert). Motion
  // Offline Alert has its own additional exclusion — see
  // MOTION_OFFLINE_EXCLUDED_CUSTOMERS in lib/scheduler.js — for "Demo
  // Account", which should still appear in the other three alerts.
  excludedCustomers: ['Cre8 IOT'],
  excludedDeviceIds: ['291078952187'],

  // Berkat Satu Hourly is scoped to exactly this one customer, per spec.
  berkatSatuCustomerName: 'BERKAT SATU TRANSPORT',
};
