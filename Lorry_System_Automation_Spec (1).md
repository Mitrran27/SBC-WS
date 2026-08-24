# Lorry System Automation — Reference Spec

This document describes the existing Lorry System automation (fleet monitoring alerts), for reference when building a compatible/similar notification system on the SBC-WS side.

**Data source:** All alerts pull data from the MettaX GPS/telematics API (`https://mettahub.mettaxiot.com/gps`).

**Scope of this document:** This describes the alert logic, triggers, schedules, and message content/format only — not the delivery channel. Each alert below can be sent through whichever messaging platform is appropriate.

**Timezone:** All times below are Malaysia Time (MYT, UTC+8). The server itself runs on UTC, so all scripts convert internally.

**Formatting note:** `*text*` below indicates bold formatting — a convention supported by most chat platforms (Telegram, WhatsApp, etc. all use this same `*bold*` style).

---

## 1. Daily Alert

**What it does:** Summarizes all vehicle fault/alert events (camera issues, power issues, memory faults, etc.) across every customer, for a rolling time window.

**MettaX data used:** `/v2/openapi/alarm/alarmPage` — alert/alarm records per device, for a given time window. Tracked alert types: Crash, SOS Alert, Device Disassembly, Device power outage, Camera Obstructed, Camera Signal Loss, Gps Blind Zone, Low Ext Power, Low internal power, Low power protection, Memory Malfunction, Disaster recovery storage failure, Data Threshold Alert.

**Schedule:** 5x/day — 9:00 AM, 12:00 PM, 3:00 PM, 6:00 PM, 9:00 PM MYT. Each run covers the 3-hour window since the previous run (the 9:00 AM run covers the overnight window, 9:00 PM the previous day to 9:00 AM).

**Also writes to:** A Google Sheet (one row per device per interval, with alert counts) — separate from the messaging/notification side.

**Format:**
```
LORRY SYSTEM
Daily Alert Summary
{date} | {time}

Period: {start} – {end}
Total Alerts: {total}

*{CUSTOMER NAME} ({count})*
{n}.{DEVICE_NAME}
> {alert_type} | {count}
> {alert_type} | {count}
{n}.{DEVICE_NAME}
> {alert_type} | {count}

*{CUSTOMER NAME} ({count})*
...

lorrysystem.ai
```

Rules:
- Every customer is listed each run, even ones with zero alerts this period — shown as `*NAME (0)*` with no device lines under them.
- Within a device, alert types are sorted by count, highest first.
- One blank line after the date/time line, one blank line after "Total Alerts:", and one blank line after each customer's block.
- If the grand total is 0 across all customers, send: `No alerts recorded. All clear!` instead of the customer breakdown.

**Example (3 vehicles):**
```
LORRY SYSTEM
Daily Alert Summary
21 Aug 2026 | 12:15 PM

Period: 09:00 – 12:00
Total Alerts: 6

*ABC LOGISTICS SDN BHD (4)*
1.WXY1234
> Camera Signal Loss | 3
> Low Ext Power | 1

*DEF TRANSPORT (2)*
1.VAB5678
> Low Ext Power | 1
2.VCD9012
> Memory Malfunction | 1

*GHI HAULAGE (0)*

lorrysystem.ai
```

---

## 2. Communication Lost

**What it does:** Flags vehicles that have not sent ANY data (GPS/telematics update) for 12+ hours — i.e. the device itself has gone silent.

**MettaX data used:** `/v2/openapi/device/shadow/deviceIds` — returns `deviceTime` (last time the device reported anything at all) per device.

**Schedule:** 2x/day — 9:30 AM and 3:30 PM MYT.

**Also writes to:** A separate Google Sheet acting as a live tracker (morning run wipes and rebuilds it, preserving any manually-added notes; afternoon run updates in place and removes vehicles that came back online).

**Behavior note:** If NO vehicles are offline 12+ hours, this sends nothing at all — stays completely silent (unlike Daily Alert, which always sends something).

**Format:**
```
LORRY SYSTEM
Communication Lost Summary
{date} | {time}

*{CUSTOMER NAME}*
{n}.{DEVICE_NAME}
> Last active {duration}
{n}.{DEVICE_NAME}
> Last active {duration}

*{CUSTOMER NAME}*
...

lorrysystem.ai
```

Duration format: `"X hrs Y mins"` if under 24 hours, `"X Day Y Hours"` if 24+ hours.

**Example (3 vehicles):**
```
LORRY SYSTEM
Communication Lost Summary
21 Aug 2026 | 3:30 PM

*ABC LOGISTICS SDN BHD*
1.WXY1234
> Last active 14 hrs 22 mins

*DEF TRANSPORT*
1.VAB5678
> Last active 2 Day 3 Hours
2.VCD9012
> Last active 18 hrs 5 mins

lorrysystem.ai
```

---

## 3. Berkat Satu Hourly (Customer-Specific Vehicle Activity)

**What it does:** Same concept as Communication Lost, but for one specific customer only, checked much more frequently, with a much shorter offline threshold (60 minutes instead of 12 hours).

**MettaX data used:** Same `/v2/openapi/device/shadow/deviceIds` endpoint, filtered to devices belonging to one customer.

**Schedule:** Every 3 hours — 6:00 AM, 9:00 AM, 12:00 PM, 3:00 PM, 6:00 PM, 9:00 PM MYT.

**Note:** This alert is scoped to one specific customer only, kept separate from the main all-customer alerts above.

**Behavior note:** If nothing is offline (or the check itself fails — no token, no device data), it aborts silently rather than sending a false "all clear."

**Format:**
```
MERCURY/ {CUSTOMER NAME}
Vehicle Activity Status
{date} | {time}
Offline / ACC OFF ({count}):
{n}.{DEVICE_NAME} | Last active {duration}
{n}.{DEVICE_NAME} | Last active {duration}

These vehicles have remained in ACC OFF status for the duration shown as of {time}
lorrysystem.ai
```

Devices are sorted longest-offline first.

**Example (3 vehicles):**
```
MERCURY/ DEF TRANSPORT
Vehicle Activity Status
21 Aug 2026 | 3:00 PM
Offline / ACC OFF (3):
1.VAB5678 | Last active 6 Day 5 Hrs
2.VCD9012 | Last active 21 hrs 14 mins
3.WXY1234 | Last active 3 hrs 57 mins

These vehicles have remained in ACC OFF status for the duration shown as of 3:00 PM
lorrysystem.ai
```

---

## 4. Motion Offline Alert (Newest Automation)

**What it does:** Detects the specific dangerous scenario where a vehicle was actively moving (ignition ON, speed > 1 km/h) but then stopped reporting data entirely — i.e. a GPS/device drop mid-drive — for 30+ minutes. Checks ALL vehicles across ALL customers.

**MettaX data used:** Same `/v2/openapi/device/shadow/deviceIds` endpoint, but this time reading the `speed`, `acc` (1 = ON, 0 = OFF), `lat`, `lon`, and `deviceTime` fields from each device's last known reading.

**Address resolution:** The last known `lat`/`lon` is converted to a real street address using the Google Maps Geocoding API, with a local cache to avoid repeated lookups for the same coordinates.

**Schedule:** Every 1 minute, 24/7 (near-instant detection).

**Behavior note — alert once per incident:** the same vehicle will NOT get a repeated alert every minute while it remains stuck in this state. It alerts once when first detected, then stays silent for that vehicle until it either comes back online (recovers) or the condition clears — at which point a future occurrence is treated as a fresh new incident.

**Format (one separate message per vehicle):**
```
🚨 VEHICLE OFFLINE ALERT

*Vehicle* : {device_name}
*Last Location:* {shortened street address}
*ACC* : {ON or OFF}
*Last Speed:* {speed} km/h
*Last Update:* {date, time}

⚠️ Device went offline while the vehicle was in motion.
```

The address is shortened by dropping the state/country from the end of Google's full formatted address (e.g. "Jalan Ampang, Kuala Lumpur." instead of "Jalan Ampang, Kuala Lumpur, Selangor, Malaysia").

**Example (3 vehicles — sent as 3 separate messages):**

```
🚨 VEHICLE OFFLINE ALERT

*Vehicle* : WXY1234
*Last Location:* Jalan Ampang, 50450 Kuala Lumpur.
*ACC* : ON
*Last Speed:* 62.0 km/h
*Last Update:* 21 Aug 2026, 2:10 PM

⚠️ Device went offline while the vehicle was in motion.
```

```
🚨 VEHICLE OFFLINE ALERT

*Vehicle* : VAB5678
*Last Location:* Persiaran Kewajipan, USJ 1, 47600 Subang Jaya.
*ACC* : ON
*Last Speed:* 78.0 km/h
*Last Update:* 21 Aug 2026, 2:14 PM

⚠️ Device went offline while the vehicle was in motion.
```

```
🚨 VEHICLE OFFLINE ALERT

*Vehicle* : VCD9012
*Last Location:* Jalan Sultan Ismail, 50250 Kuala Lumpur.
*ACC* : ON
*Last Speed:* 55.0 km/h
*Last Update:* 21 Aug 2026, 2:18 PM

⚠️ Device went offline while the vehicle was in motion.
```

---

## 5. Trip & Track (Data Only — No Messages)

**What it does:** Fetches completed trip records (start/end time, mileage, avg/max speed) and raw GPS "stay" records (arrive/leave time at a location, ACC status) for every vehicle. Does NOT send any notifications — purely stores data.

**MettaX data used:**
- `/v2/report/pageTrip` — completed trip data
- `/v2/report/pageGps` — raw GPS pings (grouped into "stay" periods when consecutive pings are at the same location)

**Schedule:** Every 3 hours — 9:45 AM, 12:45 PM, 3:45 PM, 6:45 PM, 9:45 PM, 12:45 AM, 3:45 AM, 6:45 AM MYT.

**Storage:** Local SQLite database only (two tables: `trip_records`, `raw_tracks`). No Telegram, no Google Sheet.

---

## Summary Table

| Automation | Frequency | Scope | Data Source |
|---|---|---|---|
| Daily Alert | 5x/day | All customers | `alarmPage` |
| Communication Lost | 2x/day | All customers | `device/shadow/deviceIds` |
| Berkat Satu Hourly | Every 3 hours | One specific customer | `device/shadow/deviceIds` |
| Motion Offline Alert | Every 1 minute | All customers | `device/shadow/deviceIds` + Geocoding |
| Trip & Track | Every 3 hours | All customers (data only, no messages) | `pageTrip` + `pageGps` |

---

## Notes for Building a Compatible System

- MettaX requires UTC timestamps for all API calls; the server itself runs in UTC and each script converts to/from MYT (+8 hours) internally.
- A single MettaX auth token is cached and reused for up to 40 hours (tokens are valid up to 48 hours per MettaX's docs) to avoid hitting API rate limits — this was a real issue encountered previously and is important to replicate.
- Demo/test accounts and devices should be excluded from real alerts (e.g. a customer named "Demo Account" or a known test device ID).
- Motion Offline Alert's "alert once per incident" logic (not repeating the same alert every check cycle while the condition persists) is important to replicate regardless of delivery channel, to avoid spamming.
