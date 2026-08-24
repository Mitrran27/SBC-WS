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

  // Customer name(s) to exclude from real alerts (per spec's "demo/test" note)
  excludedCustomers: ['Demo Account'],
  excludedDeviceIds: [],

  // Berkat Satu Hourly now runs for every tenant (extended from the spec's
  // original single-customer scope) — this field is unused by that job now,
  // kept only as a record of the customer it was originally named after.
  berkatSatuCustomerName: 'BERKAT SATU TRANSPORT',
};
